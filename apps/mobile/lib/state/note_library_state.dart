import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/text_encoding.dart';
import '../models/note_models.dart';
import '../models/student_models.dart';

enum NotePageInsertPosition { before, after, last }

class NoteLibraryState extends ChangeNotifier with WidgetsBindingObserver {
  NoteLibraryState() : _items = [], _documents = [] {
    WidgetsBinding.instance.addObserver(this);
  }

  static const _storageKey = 'tena_note_library_v1';

  final List<NoteLibraryItem> _items;
  final List<NoteDocument> _documents;
  final Map<String, List<NoteStroke>> _strokesByDocument = {};
  final Map<String, List<NoteStroke>> _redoByDocument = {};
  final List<String> _openDocumentIds = [];
  Timer? _persistTimer;
  bool _restoring = false;
  bool _storageReady = false;

  NoteSortMode sortMode = NoteSortMode.name;
  bool listLayout = false;
  bool selectionMode = false;
  String query = '';
  String? currentFolderId;
  NoteTool selectedTool = NoteTool.pen;
  double penWidth = 4;
  double highlighterWidth = 12;
  double eraserWidth = 14;
  Color inkColor = const Color(0xFF111827);
  Color highlighterColor = const Color(0x66FACC15);
  NoteEraserMode eraserMode = NoteEraserMode.standard;
  NotePointerMode pointerMode = NotePointerMode.dot;
  final List<Color> _penPalette = [
    const Color(0xFF111827),
    const Color(0xFFEF4444),
    const Color(0xFF2563EB),
  ];
  final List<Color> _highlighterPalette = [
    const Color(0x66FACC15),
    const Color(0x665BE66A),
    const Color(0x66F472B6),
  ];

  static const int maxPaletteColors = 12;
  static const List<Color> _penColorBank = [
    Color(0xFF111827),
    Color(0xFFEF4444),
    Color(0xFF2563EB),
    Color(0xFF16A34A),
    Color(0xFF9333EA),
    Color(0xFFEA580C),
    Color(0xFF0F766E),
    Color(0xFF64748B),
    Color(0xFFDB2777),
    Color(0xFFB45309),
    Color(0xFF0891B2),
    Color(0xFF000000),
  ];
  static const List<Color> _highlighterColorBank = [
    Color(0x66FACC15),
    Color(0x665BE66A),
    Color(0x66F472B6),
    Color(0x6638BDF8),
    Color(0x66FB923C),
    Color(0x66A78BFA),
    Color(0x66F87171),
    Color(0x662DD4BF),
    Color(0x66E879F9),
    Color(0x6684CC16),
    Color(0x66FDE047),
    Color(0x669CA3AF),
  ];

  int syncCount = 0;
  int inboxCount = 0;
  int notificationCount = 0;

  Future<void> bootstrap() async {
    _restoring = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_storageKey);
      if (raw == null || raw.trim().isEmpty) return;
      final json = jsonDecode(raw);
      if (json is! Map<String, dynamic>) return;

      final localItems = _decodeItems(json['items']);
      final localDocuments = _decodeDocuments(json['documents']);
      final localStrokes = _decodeStrokesByDocument(
        json['strokes_by_document'],
      );

      final generatedItems = _items
          .where(_isGeneratedAcademyItem)
          .toList(growable: false);
      final generatedDocuments = _documents
          .where((document) => document.id.startsWith('academy-material-'))
          .toList(growable: false);

      _items
        ..clear()
        ..addAll(localItems);
      for (final item in generatedItems) {
        if (!_items.any((existing) => existing.id == item.id)) {
          _items.add(item);
        }
      }

      _documents
        ..clear()
        ..addAll(localDocuments);
      for (final document in generatedDocuments) {
        if (!_documents.any((existing) => existing.id == document.id)) {
          _documents.add(document);
        }
      }

      _strokesByDocument
        ..clear()
        ..addAll(localStrokes);
      _redoByDocument.clear();
    } catch (_) {
      // Corrupt local note data should not block app startup.
    } finally {
      _storageReady = true;
      _restoring = false;
      notifyListeners();
    }
  }

  List<NoteLibraryItem> get items => List.unmodifiable(_items);

  List<NoteDocument> get documents => List.unmodifiable(_documents);

  List<NoteDocument> get openDocuments => _openDocumentIds
      .map((id) => documentById(id))
      .whereType<NoteDocument>()
      .toList(growable: false);

  NoteLibraryItem? get currentFolder =>
      currentFolderId == null ? null : itemById(currentFolderId!);

  List<NoteLibraryItem> get sortedItems {
    final result = _items
        .where((item) => item.parentFolderId == currentFolderId)
        .toList();
    switch (sortMode) {
      case NoteSortMode.date:
        result.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
      case NoteSortMode.name:
        result.sort(
          (a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()),
        );
      case NoteSortMode.type:
        result.sort((a, b) {
          final typeCompare = a.typeLabel.compareTo(b.typeLabel);
          if (typeCompare != 0) return typeCompare;
          return a.name.toLowerCase().compareTo(b.name.toLowerCase());
        });
    }
    return result;
  }

  List<NoteLibraryItem> get favoriteItems =>
      sortedItems.where((item) => item.favorite).toList(growable: false);

  List<NoteLibraryItem> get sharedItems =>
      sortedItems.where((item) => item.shared).toList(growable: false);

  List<NoteLibraryItem> get searchResults {
    final normalized = query.trim().toLowerCase();
    if (normalized.isEmpty) return sortedItems;
    return sortedItems
        .where((item) => item.name.toLowerCase().contains(normalized))
        .toList(growable: false);
  }

  NoteDocument? documentById(String id) {
    for (final document in _documents) {
      if (document.id == id) return document;
    }
    return null;
  }

  NoteLibraryItem? itemById(String id) {
    for (final item in _items) {
      if (item.id == id) return item;
    }
    return null;
  }

  List<NoteStroke> strokesFor(String documentId) =>
      List.unmodifiable(_strokesByDocument[documentId] ?? const []);

  bool canUndo(String documentId) =>
      (_strokesByDocument[documentId] ?? const []).isNotEmpty;

  bool canRedo(String documentId) =>
      (_redoByDocument[documentId] ?? const []).isNotEmpty;

  bool isDocumentFavorite(String documentId) =>
      documentById(documentId)?.favorite ?? false;

  void setSortMode(NoteSortMode mode) {
    sortMode = mode;
    notifyListeners();
  }

  void toggleLayout() {
    listLayout = !listLayout;
    notifyListeners();
  }

  void toggleSelectionMode() {
    selectionMode = !selectionMode;
    notifyListeners();
  }

  void updateQuery(String value) {
    query = value;
    notifyListeners();
  }

  void enterFolder(String folderId) {
    final item = itemById(folderId);
    if (item == null || item.type != NoteItemType.folder) return;
    currentFolderId = folderId;
    query = '';
    notifyListeners();
  }

  void leaveFolder() {
    if (currentFolderId == null) return;
    currentFolderId = null;
    query = '';
    notifyListeners();
  }

  void selectTool(NoteTool tool) {
    selectedTool = tool;
    notifyListeners();
  }

  void setPenWidth(double value) {
    penWidth = value;
    notifyListeners();
  }

  void setHighlighterWidth(double value) {
    highlighterWidth = value;
    notifyListeners();
  }

  void setEraserWidth(double value) {
    eraserWidth = value;
    notifyListeners();
  }

  void setEraserMode(NoteEraserMode mode) {
    eraserMode = mode;
    notifyListeners();
  }

  void setPointerMode(NotePointerMode mode) {
    pointerMode = mode;
    notifyListeners();
  }

  void setInkColor(Color color) {
    inkColor = color;
    if (!_penPalette.contains(color) && _penPalette.length < maxPaletteColors) {
      _penPalette.add(color);
    }
    notifyListeners();
  }

  void setHighlighterColor(Color color) {
    highlighterColor = color;
    if (!_highlighterPalette.contains(color) &&
        _highlighterPalette.length < maxPaletteColors) {
      _highlighterPalette.add(color);
    }
    notifyListeners();
  }

  List<Color> paletteFor(NoteTool tool) {
    if (tool == NoteTool.highlighter) {
      return List.unmodifiable(_highlighterPalette);
    }
    return List.unmodifiable(_penPalette);
  }

  bool addNextPaletteColor(NoteTool tool) {
    final palette = tool == NoteTool.highlighter
        ? _highlighterPalette
        : _penPalette;
    if (palette.length >= maxPaletteColors) return false;
    final bank = tool == NoteTool.highlighter
        ? _highlighterColorBank
        : _penColorBank;
    for (final color in bank) {
      if (palette.contains(color)) continue;
      palette.add(color);
      if (tool == NoteTool.highlighter) {
        highlighterColor = color;
      } else {
        inkColor = color;
      }
      notifyListeners();
      return true;
    }
    return false;
  }

  double widthForTool(NoteTool tool) {
    switch (tool) {
      case NoteTool.highlighter:
        return highlighterWidth;
      case NoteTool.eraser:
        return eraserWidth;
      case NoteTool.pen:
      case NoteTool.textExtractor:
      case NoteTool.lasso:
      case NoteTool.image:
      case NoteTool.text:
      case NoteTool.pointer:
        return penWidth;
    }
  }

  void setWidthForTool(NoteTool tool, double value) {
    switch (tool) {
      case NoteTool.highlighter:
        setHighlighterWidth(value);
        return;
      case NoteTool.eraser:
        setEraserWidth(value);
        return;
      case NoteTool.pen:
      case NoteTool.textExtractor:
      case NoteTool.lasso:
      case NoteTool.image:
      case NoteTool.text:
      case NoteTool.pointer:
        setPenWidth(value);
        return;
    }
  }

  void addFolder(String name) {
    final timestamp = DateTime.now();
    _items.insert(
      0,
      NoteLibraryItem(
        id: 'folder-${timestamp.microsecondsSinceEpoch}',
        name: name.trim().isEmpty ? '새 폴더' : name.trim(),
        type: NoteItemType.folder,
        updatedAt: timestamp,
        favorite: false,
        shared: false,
        documentCount: 0,
        color: const Color(0xFFF4F4F5),
        parentFolderId: currentFolderId,
      ),
    );
    notifyListeners();
  }

  NoteDocument addNotebook({String? folderId}) {
    final timestamp = DateTime.now();
    final documentId = 'note-${timestamp.microsecondsSinceEpoch}';
    final document = NoteDocument(
      id: documentId,
      title: '새 노트',
      folderId: folderId ?? currentFolderId ?? documentId,
      updatedAt: timestamp,
      favorite: false,
    );
    _documents.insert(0, document);
    _items.insert(
      0,
      NoteLibraryItem(
        id: document.id,
        name: document.title,
        type: NoteItemType.notebook,
        updatedAt: timestamp,
        favorite: false,
        shared: false,
        documentCount: 1,
        color: const Color(0xFFFFFFFF),
        parentFolderId: folderId ?? currentFolderId,
      ),
    );
    _openDocumentIds.insert(0, document.id);
    notifyListeners();
    return document;
  }

  NoteDocument openDocumentForItem(String itemId) {
    final item = itemById(itemId);
    if (item != null && item.type == NoteItemType.folder) {
      enterFolder(item.id);
    }
    if (item != null && item.type != NoteItemType.folder) {
      final document = documentById(item.id);
      if (document != null) {
        if (!_openDocumentIds.contains(document.id)) {
          _openDocumentIds.insert(0, document.id);
          notifyListeners();
        }
        return document;
      }
    }
    final existing = _documents.where(
      (document) => document.folderId == itemId,
    );
    final document = existing.isEmpty
        ? addNotebook(folderId: itemId)
        : existing.first;
    if (!_openDocumentIds.contains(document.id)) {
      _openDocumentIds.insert(0, document.id);
      notifyListeners();
    }
    return document;
  }

  void syncAcademyMaterials({
    required List<AcademyMembership> academies,
    required List<StudentMaterial> materials,
  }) {
    final syncTime = DateTime.now();
    final academyNameById = <String, String>{};
    final academyJoinedAtById = <String, DateTime>{};
    for (final academy in academies) {
      academyNameById[academy.academyId] = academy.academyName ?? 'Academy';
      academyJoinedAtById[academy.academyId] = academy.joinedAt;
    }

    final materialsByAcademy = <String, List<StudentMaterial>>{};
    for (final material in materials) {
      materialsByAcademy
          .putIfAbsent(material.academyId, () => [])
          .add(material);
      academyNameById.putIfAbsent(
        material.academyId,
        () => material.academyName ?? 'Academy',
      );
    }

    final desiredFolderIds = <String>{
      for (final academyId in academyNameById.keys) _academyFolderId(academyId),
    };
    final desiredMaterialIds = <String>{
      for (final material in materials) _materialItemId(material.id),
    };

    var changed = false;
    changed =
        _removeGeneratedItems(desiredFolderIds, desiredMaterialIds) || changed;

    for (final entry in academyNameById.entries) {
      final academyId = entry.key;
      final folderId = _academyFolderId(academyId);
      final folderMaterials = materialsByAcademy[academyId] ?? const [];
      final existingFolder = itemById(folderId);
      final folderFallback =
          _usableTimestamp(existingFolder?.updatedAt) ??
          _usableTimestamp(academyJoinedAtById[academyId]) ??
          syncTime;
      final updatedAt = folderMaterials
          .map((material) => _usableTimestamp(material.updatedAt))
          .whereType<DateTime>()
          .fold<DateTime>(folderFallback, (latest, value) {
            return value.isAfter(latest) ? value : latest;
          });
      changed =
          _upsertItem(
            NoteLibraryItem(
              id: folderId,
              name: entry.value,
              type: NoteItemType.folder,
              updatedAt: updatedAt,
              favorite: false,
              shared: true,
              documentCount: folderMaterials.length,
              color: const Color(0xFFE5E7EB),
              academyId: academyId,
            ),
          ) ||
          changed;
    }

    for (final material in materials) {
      final folderId = _academyFolderId(material.academyId);
      final documentId = _materialItemId(material.id);
      final materialTitle = repairKoreanText(material.title);
      final printedPages = _printedPagesForMaterial(material);
      final isPrintedNotebook = printedPages.isNotEmpty;
      final existingDocument = documentById(documentId);
      final pageRefs = _reconcilePageRefs(
        existingDocument?.pageRefs ?? const [],
        printedPages,
      );
      final documentPageCount = pageRefs.isEmpty
          ? (isPrintedNotebook ? printedPages.length : 1)
          : pageRefs.length;
      final materialUpdatedAt = _usableTimestamp(material.updatedAt);
      final existingUpdatedAt = _usableTimestamp(existingDocument?.updatedAt);
      final updatedAt =
          _latestTimestamp(materialUpdatedAt, existingUpdatedAt) ?? syncTime;
      changed =
          _upsertDocument(
            NoteDocument(
              id: documentId,
              title: materialTitle,
              folderId: folderId,
              updatedAt: updatedAt,
              favorite: false,
              printedPages: printedPages,
              pageRefs: pageRefs,
            ),
          ) ||
          changed;
      changed =
          _upsertItem(
            NoteLibraryItem(
              id: documentId,
              name: materialTitle,
              type: isPrintedNotebook
                  ? NoteItemType.notebook
                  : NoteItemType.pdf,
              updatedAt: updatedAt,
              favorite: false,
              shared: true,
              documentCount: documentPageCount,
              color: const Color(0xFFFFFFFF),
              parentFolderId: folderId,
              academyId: material.academyId,
              materialId: material.id,
              assignmentId: material.content?.learningAssignmentId,
              assignmentType: material.content?.assignmentType,
              assignmentStatus: material.content?.submissionStatus,
              assignmentSubmittedAt: material.content?.submittedAt,
            ),
          ) ||
          changed;
    }

    if (changed) notifyListeners();
  }

  void closeDocument(String documentId) {
    if (_openDocumentIds.length == 1) return;
    _openDocumentIds.remove(documentId);
    notifyListeners();
  }

  void toggleFavorite(String itemId) {
    final index = _items.indexWhere((item) => item.id == itemId);
    if (index == -1) return;
    _items[index] = _items[index].copyWith(
      favorite: !_items[index].favorite,
      updatedAt: DateTime.now(),
    );
    notifyListeners();
  }

  void toggleDocumentFavorite(String documentId) {
    final index = _documents.indexWhere(
      (document) => document.id == documentId,
    );
    if (index == -1) return;
    _documents[index] = _documents[index].copyWith(
      favorite: !_documents[index].favorite,
      updatedAt: DateTime.now(),
    );
    final itemIndex = _items.indexWhere((item) => item.id == documentId);
    if (itemIndex != -1) {
      _items[itemIndex] = _items[itemIndex].copyWith(
        favorite: _documents[index].favorite,
        updatedAt: _documents[index].updatedAt,
      );
    }
    notifyListeners();
  }

  void renameDocument(String documentId, String title) {
    final trimmed = title.trim();
    if (trimmed.isEmpty) return;
    final index = _documents.indexWhere(
      (document) => document.id == documentId,
    );
    if (index == -1) return;
    _documents[index] = _documents[index].copyWith(
      title: trimmed,
      updatedAt: DateTime.now(),
    );
    final itemIndex = _items.indexWhere((item) => item.id == documentId);
    if (itemIndex != -1) {
      _items[itemIndex] = _items[itemIndex].copyWith(
        name: trimmed,
        updatedAt: _documents[index].updatedAt,
      );
    }
    notifyListeners();
  }

  void renameItem(String itemId, String name) {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return;
    final index = _items.indexWhere((item) => item.id == itemId);
    if (index == -1) return;
    _items[index] = _items[index].copyWith(
      name: trimmed,
      updatedAt: DateTime.now(),
    );
    notifyListeners();
  }

  void addStroke(String documentId, NoteStroke stroke) {
    final strokes = _strokesByDocument.putIfAbsent(documentId, () => []);
    strokes.add(stroke);
    _redoByDocument[documentId] = [];
    _touchDocument(documentId);
    notifyListeners();
  }

  void undoStroke(String documentId) {
    final strokes = _strokesByDocument[documentId];
    if (strokes == null || strokes.isEmpty) return;
    final redo = _redoByDocument.putIfAbsent(documentId, () => []);
    redo.add(strokes.removeLast());
    _touchDocument(documentId);
    notifyListeners();
  }

  void redoStroke(String documentId) {
    final redo = _redoByDocument[documentId];
    if (redo == null || redo.isEmpty) return;
    final strokes = _strokesByDocument.putIfAbsent(documentId, () => []);
    strokes.add(redo.removeLast());
    _touchDocument(documentId);
    notifyListeners();
  }

  void eraseLastStroke(String documentId) {
    undoStroke(documentId);
  }

  bool eraseAt(String documentId, Offset point) {
    final strokes = _strokesByDocument[documentId];
    if (strokes == null || strokes.isEmpty) return false;

    final radius = switch (eraserMode) {
      NoteEraserMode.precision => eraserWidth * 0.55,
      NoteEraserMode.standard => eraserWidth,
      NoteEraserMode.stroke => eraserWidth,
    };

    for (var index = strokes.length - 1; index >= 0; index -= 1) {
      final stroke = strokes[index];
      if (eraserMode == NoteEraserMode.stroke) {
        if (!_strokeContainsPoint(stroke, point, radius)) continue;
        strokes.removeAt(index);
        _redoByDocument[documentId] = [];
        _touchDocument(documentId);
        notifyListeners();
        return true;
      }

      final replacement = _eraseStrokePart(stroke, point, radius);
      if (replacement == null) continue;
      strokes
        ..removeAt(index)
        ..insertAll(index, replacement);
      _redoByDocument[documentId] = [];
      _touchDocument(documentId);
      notifyListeners();
      return true;
    }
    return false;
  }

  void clearPage(String documentId) {
    _strokesByDocument[documentId] = [];
    _redoByDocument[documentId] = [];
    _touchDocument(documentId);
    notifyListeners();
  }

  List<NoteStroke>? _eraseStrokePart(
    NoteStroke stroke,
    Offset point,
    double radius,
  ) {
    if (stroke.isImage || stroke.text != null || stroke.points.length < 2) {
      return _strokeContainsPoint(stroke, point, radius) ? const [] : null;
    }

    final threshold = radius + stroke.width / 2;
    final removed = List<bool>.filled(stroke.points.length, false);
    var touched = false;

    for (var index = 0; index < stroke.points.length - 1; index += 1) {
      final first = stroke.points[index];
      final second = stroke.points[index + 1];
      if (_distanceToSegment(point, first, second) <= threshold) {
        removed[index] = true;
        removed[index + 1] = true;
        touched = true;
      }
    }
    if (!touched) return null;

    final result = <NoteStroke>[];
    var segment = <Offset>[];
    for (var index = 0; index < stroke.points.length; index += 1) {
      if (removed[index]) {
        if (segment.length > 1) {
          result.add(
            stroke.copyWith(points: List<Offset>.unmodifiable(segment)),
          );
        }
        segment = <Offset>[];
      } else {
        segment.add(stroke.points[index]);
      }
    }
    if (segment.length > 1) {
      result.add(stroke.copyWith(points: List<Offset>.unmodifiable(segment)));
    }
    return result;
  }

  bool _strokeContainsPoint(NoteStroke stroke, Offset point, double radius) {
    if (stroke.points.isEmpty) return false;
    if (stroke.isImage) {
      final origin = stroke.points.first;
      final rect = Rect.fromLTWH(
        origin.dx,
        origin.dy,
        stroke.imageWidth ?? 320,
        stroke.imageHeight ?? 220,
      ).inflate(radius);
      return rect.contains(point);
    }
    if (stroke.text != null) {
      final origin = stroke.points.first;
      final rect = Rect.fromLTWH(
        origin.dx,
        origin.dy,
        (stroke.text!.length * 10).clamp(44, 320).toDouble(),
        28,
      ).inflate(radius);
      return rect.contains(point);
    }
    if (stroke.points.length == 1) {
      return (stroke.points.first - point).distance <=
          radius + stroke.width / 2;
    }
    final threshold = radius + stroke.width / 2;
    for (var index = 0; index < stroke.points.length - 1; index += 1) {
      if (_distanceToSegment(
            point,
            stroke.points[index],
            stroke.points[index + 1],
          ) <=
          threshold) {
        return true;
      }
    }
    return false;
  }

  double _distanceToSegment(Offset point, Offset first, Offset second) {
    final segment = second - first;
    final lengthSquared = segment.dx * segment.dx + segment.dy * segment.dy;
    if (lengthSquared == 0) return (point - first).distance;
    final t =
        (((point.dx - first.dx) * segment.dx) +
            ((point.dy - first.dy) * segment.dy)) /
        lengthSquared;
    final clamped = t.clamp(0.0, 1.0).toDouble();
    final projection = Offset(
      first.dx + segment.dx * clamped,
      first.dy + segment.dy * clamped,
    );
    return (point - projection).distance;
  }

  void addTextAt(String documentId, Offset point, String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;
    addStroke(
      documentId,
      NoteStroke(points: [point], color: inkColor, width: 1, text: trimmed),
    );
  }

  void addImageAt(
    String documentId, {
    required Offset point,
    required String imageData,
    required String mimeType,
    required double imageWidth,
    required double imageHeight,
  }) {
    if (imageData.isEmpty || imageWidth <= 0 || imageHeight <= 0) return;
    addStroke(
      documentId,
      NoteStroke(
        points: [point],
        color: Colors.transparent,
        width: 1,
        imageData: imageData,
        imageMimeType: mimeType,
        imageWidth: imageWidth,
        imageHeight: imageHeight,
      ),
    );
  }

  NoteStroke? updateImageStroke(
    String documentId,
    NoteStroke stroke, {
    Offset? point,
    double? imageWidth,
    double? imageHeight,
  }) {
    if (!stroke.isImage) return null;
    final strokes = _strokesByDocument[documentId];
    if (strokes == null || strokes.isEmpty) return null;
    final index = _strokeIndex(strokes, stroke);
    if (index == -1) return null;

    final nextWidth = imageWidth ?? stroke.imageWidth ?? 320;
    final nextHeight = imageHeight ?? stroke.imageHeight ?? 220;
    if (nextWidth <= 0 || nextHeight <= 0) return null;

    final updated = NoteStroke(
      points: List<Offset>.unmodifiable(
        point == null ? stroke.points : <Offset>[point],
      ),
      color: stroke.color,
      width: stroke.width,
      isHighlighter: stroke.isHighlighter,
      text: stroke.text,
      imageData: stroke.imageData,
      imageMimeType: stroke.imageMimeType,
      imageWidth: nextWidth,
      imageHeight: nextHeight,
    );
    strokes[index] = updated;
    _redoByDocument[documentId] = [];
    _touchDocument(documentId);
    notifyListeners();
    return updated;
  }

  bool removeStroke(String documentId, NoteStroke stroke) {
    final strokes = _strokesByDocument[documentId];
    if (strokes == null || strokes.isEmpty) return false;
    final index = _strokeIndex(strokes, stroke);
    if (index == -1) return false;
    strokes.removeAt(index);
    _redoByDocument[documentId] = [];
    _touchDocument(documentId);
    notifyListeners();
    return true;
  }

  int _strokeIndex(List<NoteStroke> strokes, NoteStroke stroke) {
    for (var index = 0; index < strokes.length; index += 1) {
      if (identical(strokes[index], stroke)) return index;
    }
    return -1;
  }

  int addBlankPage(
    String documentId, {
    required NotePageInsertPosition position,
    required int currentPageIndex,
  }) {
    final index = _documents.indexWhere(
      (document) => document.id == documentId,
    );
    if (index == -1) return 1;

    final document = _documents[index];
    final pageRefs = _effectivePageRefs(document).toList(growable: true);
    final timestamp = DateTime.now();
    final nextPageRef = _blankPageRef(
      'page-${timestamp.microsecondsSinceEpoch}',
    );
    final insertionIndex = switch (position) {
      NotePageInsertPosition.before => currentPageIndex.clamp(
        0,
        pageRefs.length,
      ),
      NotePageInsertPosition.after => (currentPageIndex + 1).clamp(
        0,
        pageRefs.length,
      ),
      NotePageInsertPosition.last => pageRefs.length,
    }.toInt();

    pageRefs.insert(insertionIndex, nextPageRef);
    _documents[index] = document.copyWith(
      updatedAt: timestamp,
      pageRefs: pageRefs,
    );
    final itemIndex = _items.indexWhere((item) => item.id == documentId);
    if (itemIndex != -1) {
      _items[itemIndex] = _items[itemIndex].copyWith(
        updatedAt: timestamp,
        documentCount: pageRefs.length,
      );
    }
    notifyListeners();
    return insertionIndex + 1;
  }

  @override
  void notifyListeners() {
    super.notifyListeners();
    if (_storageReady && !_restoring) {
      _schedulePersist();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _persistTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      _persistTimer?.cancel();
      if (_storageReady) {
        unawaited(_persistNow());
      }
    }
  }

  void _schedulePersist() {
    _persistTimer?.cancel();
    _persistTimer = Timer(const Duration(milliseconds: 250), () {
      unawaited(_persistNow());
    });
  }

  Future<void> _persistNow() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final payload = <String, dynamic>{
        'version': 1,
        'items': _items
            .where((item) => !_isGeneratedAcademyItem(item))
            .map(_encodeItem)
            .toList(growable: false),
        'documents': _documents.map(_encodeDocument).toList(growable: false),
        'strokes_by_document': _encodeStrokesByDocument(_strokesByDocument),
      };
      await prefs.setString(_storageKey, jsonEncode(payload));
    } catch (_) {
      // Local persistence is best-effort; keep the in-memory note session alive.
    }
  }

  String _academyFolderId(String academyId) => 'academy-folder-$academyId';

  String _materialItemId(String materialId) => 'academy-material-$materialId';

  bool _isGeneratedAcademyItem(NoteLibraryItem item) =>
      item.id.startsWith('academy-folder-') ||
      item.id.startsWith('academy-material-');

  bool _removeGeneratedItems(
    Set<String> desiredFolderIds,
    Set<String> desiredMaterialIds,
  ) {
    final beforeItems = _items.length;
    _items.removeWhere((item) {
      if (!_isGeneratedAcademyItem(item)) return false;
      if (item.id.startsWith('academy-folder-')) {
        return !desiredFolderIds.contains(item.id);
      }
      return !desiredMaterialIds.contains(item.id);
    });

    final beforeDocuments = _documents.length;
    _documents.removeWhere(
      (document) =>
          document.id.startsWith('academy-material-') &&
          !desiredMaterialIds.contains(document.id),
    );
    _openDocumentIds.removeWhere(
      (id) =>
          id.startsWith('academy-material-') &&
          !desiredMaterialIds.contains(id),
    );
    if (currentFolderId != null &&
        !desiredFolderIds.contains(currentFolderId)) {
      currentFolderId = null;
    }
    return beforeItems != _items.length || beforeDocuments != _documents.length;
  }

  bool _upsertItem(NoteLibraryItem next) {
    final index = _items.indexWhere((item) => item.id == next.id);
    if (index == -1) {
      _items.add(next);
      return true;
    }
    final current = _items[index];
    final changed =
        current.name != next.name ||
        current.type != next.type ||
        current.updatedAt != next.updatedAt ||
        current.favorite != next.favorite ||
        current.shared != next.shared ||
        current.documentCount != next.documentCount ||
        current.color != next.color ||
        current.parentFolderId != next.parentFolderId ||
        current.academyId != next.academyId ||
        current.materialId != next.materialId ||
        current.assignmentId != next.assignmentId ||
        current.assignmentType != next.assignmentType ||
        current.assignmentStatus != next.assignmentStatus ||
        current.assignmentSubmittedAt != next.assignmentSubmittedAt;
    if (changed) {
      _items[index] = next;
    }
    return changed;
  }

  bool _upsertDocument(NoteDocument next) {
    final index = _documents.indexWhere((document) => document.id == next.id);
    if (index == -1) {
      _documents.add(next);
      return true;
    }
    final current = _documents[index];
    final changed =
        current.title != next.title ||
        current.folderId != next.folderId ||
        current.updatedAt != next.updatedAt ||
        current.favorite != next.favorite ||
        !_samePrintedPages(current.printedPages, next.printedPages) ||
        !_sameStringList(current.pageRefs, next.pageRefs);
    if (changed) {
      _documents[index] = next;
    }
    return changed;
  }

  List<PrintedNotePage> _printedPagesForMaterial(StudentMaterial material) {
    final content = material.content;
    if (content == null || content.renderMode != 'notebook_problem_pages') {
      return const [];
    }
    final materialTitle = repairKoreanText(material.title);
    return content.problems
        .asMap()
        .entries
        .map((entry) {
          final problem = entry.value;
          final pageNumber = problem.pageNumber <= 0
              ? entry.key + 1
              : problem.pageNumber;
          final visibleNumber =
              problem.problemNumber ??
              problem.originalProblemNumber?.toString() ??
              pageNumber.toString();
          return PrintedNotePage(
            problemId: problem.id,
            pageNumber: pageNumber,
            title: '$visibleNumber번',
            body: problem.problemText,
            sourceLabel: problem.sourceLabel ?? materialTitle,
            visualUrl: problem.visualUrl ?? problem.reviewPageImageUrl,
            tags: problem.tags,
          );
        })
        .toList(growable: false);
  }

  bool _samePrintedPages(
    List<PrintedNotePage> current,
    List<PrintedNotePage> next,
  ) {
    if (current.length != next.length) return false;
    for (var index = 0; index < current.length; index += 1) {
      if (!current[index].sameContentAs(next[index])) return false;
    }
    return true;
  }

  bool _sameStringList(List<String> current, List<String> next) {
    if (current.length != next.length) return false;
    for (var index = 0; index < current.length; index += 1) {
      if (current[index] != next[index]) return false;
    }
    return true;
  }

  List<String> _reconcilePageRefs(
    List<String> existing,
    List<PrintedNotePage> printedPages,
  ) {
    if (existing.isEmpty) return const [];
    final printedRefs = printedPages.map(_printedPageRef).toList();
    final validPrintedRefs = printedRefs.toSet();
    final result = existing
        .where(
          (ref) => ref.startsWith('blank:') || validPrintedRefs.contains(ref),
        )
        .toList(growable: true);
    final resultSet = result.toSet();
    for (var index = printedRefs.length - 1; index >= 0; index -= 1) {
      final ref = printedRefs[index];
      if (!resultSet.contains(ref)) {
        result.insert(0, ref);
      }
    }
    return result;
  }

  List<String> _effectivePageRefs(NoteDocument document) {
    if (document.pageRefs.isNotEmpty) return document.pageRefs;
    if (document.printedPages.isNotEmpty) {
      return document.printedPages.map(_printedPageRef).toList(growable: false);
    }
    return [_blankPageRef(document.id)];
  }

  String _printedPageRef(PrintedNotePage page) => 'printed:${page.problemId}';

  String _blankPageRef(String pageId) => 'blank:$pageId';

  DateTime? _usableTimestamp(DateTime? value) {
    if (value == null) return null;
    if (value.year < 2001) return null;
    return value;
  }

  DateTime? _latestTimestamp(DateTime? first, DateTime? second) {
    if (first == null) return second;
    if (second == null) return first;
    return first.isAfter(second) ? first : second;
  }

  void _touchDocument(String documentId) {
    final index = _documents.indexWhere(
      (document) => document.id == documentId,
    );
    if (index == -1) return;
    _documents[index] = _documents[index].copyWith(updatedAt: DateTime.now());
    final itemIndex = _items.indexWhere((item) => item.id == documentId);
    if (itemIndex != -1) {
      _items[itemIndex] = _items[itemIndex].copyWith(
        updatedAt: _documents[index].updatedAt,
      );
    }
  }

  Map<String, dynamic> _encodeItem(NoteLibraryItem item) => {
    'id': item.id,
    'name': item.name,
    'type': item.type.name,
    'updated_at': item.updatedAt.toIso8601String(),
    'favorite': item.favorite,
    'shared': item.shared,
    'document_count': item.documentCount,
    'color': item.color.toARGB32(),
    'parent_folder_id': item.parentFolderId,
    'academy_id': item.academyId,
    'material_id': item.materialId,
    'assignment_id': item.assignmentId,
    'assignment_type': item.assignmentType,
    'assignment_status': item.assignmentStatus,
    'assignment_submitted_at': item.assignmentSubmittedAt?.toIso8601String(),
  };

  Map<String, dynamic> _encodeDocument(NoteDocument document) => {
    'id': document.id,
    'title': document.title,
    'folder_id': document.folderId,
    'updated_at': document.updatedAt.toIso8601String(),
    'favorite': document.favorite,
    'printed_pages': document.printedPages
        .map(_encodePrintedPage)
        .toList(growable: false),
    'page_refs': document.pageRefs,
  };

  Map<String, dynamic> _encodePrintedPage(PrintedNotePage page) => {
    'problem_id': page.problemId,
    'page_number': page.pageNumber,
    'title': page.title,
    'body': page.body,
    'source_label': page.sourceLabel,
    'visual_url': page.visualUrl,
    'tags': page.tags,
  };

  Map<String, dynamic> _encodeStroke(NoteStroke stroke) => {
    'points': stroke.points
        .map((point) => {'x': point.dx, 'y': point.dy})
        .toList(growable: false),
    'color': stroke.color.toARGB32(),
    'width': stroke.width,
    'is_highlighter': stroke.isHighlighter,
    'text': stroke.text,
    'image_data': stroke.imageData,
    'image_mime_type': stroke.imageMimeType,
    'image_width': stroke.imageWidth,
    'image_height': stroke.imageHeight,
  };

  Map<String, dynamic> _encodeStrokesByDocument(
    Map<String, List<NoteStroke>> strokesByDocument,
  ) {
    final result = <String, dynamic>{};
    for (final entry in strokesByDocument.entries) {
      if (entry.value.isEmpty) continue;
      result[entry.key] = entry.value
          .map(_encodeStroke)
          .toList(growable: false);
    }
    return result;
  }

  List<NoteLibraryItem> _decodeItems(Object? raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => _decodeItem(Map<String, dynamic>.from(item)))
        .whereType<NoteLibraryItem>()
        .toList(growable: false);
  }

  NoteLibraryItem? _decodeItem(Map<String, dynamic> json) {
    final id = json['id']?.toString();
    final name = json['name']?.toString();
    final updatedAt = _parseDate(json['updated_at']);
    if (id == null || id.isEmpty || name == null || updatedAt == null) {
      return null;
    }
    return NoteLibraryItem(
      id: id,
      name: name,
      type: _parseItemType(json['type']),
      updatedAt: updatedAt,
      favorite: json['favorite'] == true,
      shared: json['shared'] == true,
      documentCount: (json['document_count'] as num?)?.toInt() ?? 0,
      color: Color((json['color'] as num?)?.toInt() ?? 0xFFFFFFFF),
      parentFolderId: json['parent_folder_id']?.toString(),
      academyId: json['academy_id']?.toString(),
      materialId: json['material_id']?.toString(),
      assignmentId: json['assignment_id']?.toString(),
      assignmentType: json['assignment_type']?.toString(),
      assignmentStatus: json['assignment_status']?.toString(),
      assignmentSubmittedAt: _parseDate(json['assignment_submitted_at']),
    );
  }

  List<NoteDocument> _decodeDocuments(Object? raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => _decodeDocument(Map<String, dynamic>.from(item)))
        .whereType<NoteDocument>()
        .toList(growable: false);
  }

  NoteDocument? _decodeDocument(Map<String, dynamic> json) {
    final id = json['id']?.toString();
    final title = json['title']?.toString();
    final folderId = json['folder_id']?.toString();
    final updatedAt = _parseDate(json['updated_at']);
    if (id == null ||
        id.isEmpty ||
        title == null ||
        folderId == null ||
        updatedAt == null) {
      return null;
    }
    return NoteDocument(
      id: id,
      title: title,
      folderId: folderId,
      updatedAt: updatedAt,
      favorite: json['favorite'] == true,
      printedPages: _decodePrintedPages(json['printed_pages']),
      pageRefs:
          (json['page_refs'] as List?)?.map((ref) => ref.toString()).toList() ??
          const [],
    );
  }

  List<PrintedNotePage> _decodePrintedPages(Object? raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => _decodePrintedPage(Map<String, dynamic>.from(item)))
        .whereType<PrintedNotePage>()
        .toList(growable: false);
  }

  PrintedNotePage? _decodePrintedPage(Map<String, dynamic> json) {
    final problemId = json['problem_id']?.toString();
    final title = json['title']?.toString();
    if (problemId == null || title == null) return null;
    return PrintedNotePage(
      problemId: problemId,
      pageNumber: (json['page_number'] as num?)?.toInt() ?? 1,
      title: title,
      body: json['body']?.toString(),
      sourceLabel: json['source_label']?.toString(),
      visualUrl: json['visual_url']?.toString(),
      tags:
          (json['tags'] as List?)?.map((tag) => tag.toString()).toList() ??
          const [],
    );
  }

  Map<String, List<NoteStroke>> _decodeStrokesByDocument(Object? raw) {
    if (raw is! Map) return const {};
    final result = <String, List<NoteStroke>>{};
    for (final entry in raw.entries) {
      final documentId = entry.key.toString();
      final strokes = _decodeStrokes(entry.value);
      if (documentId.isNotEmpty && strokes.isNotEmpty) {
        result[documentId] = strokes;
      }
    }
    return result;
  }

  List<NoteStroke> _decodeStrokes(Object? raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => _decodeStroke(Map<String, dynamic>.from(item)))
        .whereType<NoteStroke>()
        .toList(growable: false);
  }

  NoteStroke? _decodeStroke(Map<String, dynamic> json) {
    final points = _decodePoints(json['points']);
    final text = json['text']?.toString();
    final imageData = json['image_data']?.toString();
    if (points.isEmpty &&
        (text == null || text.isEmpty) &&
        (imageData == null || imageData.isEmpty)) {
      return null;
    }
    return NoteStroke(
      points: points,
      color: Color((json['color'] as num?)?.toInt() ?? 0xFF111827),
      width: (json['width'] as num?)?.toDouble() ?? 3,
      isHighlighter: json['is_highlighter'] == true,
      text: text,
      imageData: imageData,
      imageMimeType: json['image_mime_type']?.toString(),
      imageWidth: (json['image_width'] as num?)?.toDouble(),
      imageHeight: (json['image_height'] as num?)?.toDouble(),
    );
  }

  List<Offset> _decodePoints(Object? raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((point) {
          final json = Map<String, dynamic>.from(point);
          final x = (json['x'] as num?)?.toDouble();
          final y = (json['y'] as num?)?.toDouble();
          if (x == null || y == null) return null;
          return Offset(x, y);
        })
        .whereType<Offset>()
        .toList(growable: false);
  }

  DateTime? _parseDate(Object? raw) {
    final value = raw?.toString();
    if (value == null || value.isEmpty) return null;
    return DateTime.tryParse(value);
  }

  NoteItemType _parseItemType(Object? raw) {
    final value = raw?.toString();
    for (final type in NoteItemType.values) {
      if (type.name == value) return type;
    }
    return NoteItemType.notebook;
  }
}
