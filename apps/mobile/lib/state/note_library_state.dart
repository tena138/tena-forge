import 'package:flutter/material.dart';

import '../core/text_encoding.dart';
import '../models/note_models.dart';
import '../models/student_models.dart';

class NoteLibraryState extends ChangeNotifier {
  NoteLibraryState() : _items = [], _documents = [];

  final List<NoteLibraryItem> _items;
  final List<NoteDocument> _documents;
  final Map<String, List<NoteStroke>> _strokesByDocument = {};
  final Map<String, List<NoteStroke>> _redoByDocument = {};
  final List<String> _openDocumentIds = [];

  NoteSortMode sortMode = NoteSortMode.name;
  bool listLayout = false;
  bool selectionMode = false;
  String query = '';
  String? currentFolderId;
  NoteTool selectedTool = NoteTool.pen;
  double penWidth = 3;
  Color inkColor = const Color(0xFF111827);

  int syncCount = 0;
  int inboxCount = 0;
  int notificationCount = 0;

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
      final updatedAt =
          _usableTimestamp(material.updatedAt) ??
          _usableTimestamp(documentById(documentId)?.updatedAt) ??
          syncTime;
      changed =
          _upsertDocument(
            NoteDocument(
              id: documentId,
              title: materialTitle,
              folderId: folderId,
              updatedAt: updatedAt,
              favorite: false,
              printedPages: printedPages,
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
              documentCount: isPrintedNotebook ? printedPages.length : 1,
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

  void clearPage(String documentId) {
    _strokesByDocument[documentId] = [];
    _redoByDocument[documentId] = [];
    _touchDocument(documentId);
    notifyListeners();
  }

  void addTextAt(String documentId, Offset point, String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;
    addStroke(
      documentId,
      NoteStroke(points: [point], color: inkColor, width: 1, text: trimmed),
    );
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
        !_samePrintedPages(current.printedPages, next.printedPages);
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

  DateTime? _usableTimestamp(DateTime? value) {
    if (value == null) return null;
    if (value.year < 2001) return null;
    return value;
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
}
