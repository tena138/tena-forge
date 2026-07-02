import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_math_fork/flutter_math.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../core/api_client.dart';
import '../models/note_models.dart';
import '../state/note_library_state.dart';
import '../state/student_app_state.dart';

class NoteEditorScreen extends StatefulWidget {
  const NoteEditorScreen({required this.documentId, super.key});

  final String documentId;

  @override
  State<NoteEditorScreen> createState() => _NoteEditorScreenState();
}

class _NoteEditorScreenState extends State<NoteEditorScreen> {
  final GlobalKey<_CanvasStageState> _canvasStageKey =
      GlobalKey<_CanvasStageState>();
  final ValueNotifier<int> _printedPageIndex = ValueNotifier<int>(0);

  @override
  void didUpdateWidget(covariant NoteEditorScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.documentId != widget.documentId) {
      _printedPageIndex.value = 0;
    }
  }

  @override
  void dispose() {
    _printedPageIndex.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<NoteLibraryState>();
    final document = state.documentById(widget.documentId);
    if (document == null) {
      return Scaffold(
        backgroundColor: AppColors.bg,
        body: SafeArea(
          child: Center(
            child: FilledButton.icon(
              onPressed: () => context.go('/notes'),
              icon: const Icon(Icons.arrow_back_rounded),
              label: const Text('Documents로 돌아가기'),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _EditorTopBar(
              document: document,
              printedPageIndex: _printedPageIndex,
              onPrintedPageJump: _jumpToPrintedPage,
            ),
            _EditorToolBar(
              document: document,
              printedPageIndex: _printedPageIndex,
              onPrintedPageJump: _jumpToPrintedPage,
            ),
            Expanded(
              child: _CanvasStage(
                key: _canvasStageKey,
                documentId: document.id,
                onPrintedPageChanged: _handlePrintedPageChanged,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _handlePrintedPageChanged(int index) {
    if (_printedPageIndex.value == index) return;
    _printedPageIndex.value = index;
  }

  void _jumpToPrintedPage(int pageNumber) {
    _canvasStageKey.currentState?.jumpToPrintedPage(pageNumber);
  }
}

class _EditorTopBar extends StatelessWidget {
  const _EditorTopBar({
    required this.document,
    required this.printedPageIndex,
    required this.onPrintedPageJump,
  });

  final NoteDocument document;
  final ValueListenable<int> printedPageIndex;
  final ValueChanged<int> onPrintedPageJump;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<NoteLibraryState>();
    return LayoutBuilder(
      builder: (context, constraints) {
        final barWidth = math.max(constraints.maxWidth, 860.0);
        return SizedBox(
          height: 58,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SizedBox(
              width: barWidth,
              child: Row(
                children: [
                  _EditorIconButton(
                    icon: Icons.arrow_back_ios_new_rounded,
                    tooltip: '뒤로',
                    onPressed: () => context.go('/notes'),
                  ),
                  _EditorIconButton(
                    icon: Icons.grid_view_rounded,
                    tooltip: '페이지 목록',
                    onPressed: () => _showPageOverview(
                      context,
                      document.id,
                      selectedPrintedPageIndex: printedPageIndex.value,
                      onPrintedPageJump: onPrintedPageJump,
                    ),
                  ),
                  _EditorIconButton(
                    icon: Icons.search_rounded,
                    tooltip: '검색',
                    onPressed: () => _showDocumentSearch(
                      context,
                      document: document,
                      selectedPrintedPageIndex: printedPageIndex.value,
                      onPrintedPageJump: onPrintedPageJump,
                    ),
                  ),
                  _EditorIconButton(
                    icon: Icons.ios_share_rounded,
                    tooltip: '공유',
                    onPressed: () => _showShareExportPanel(
                      context,
                      document: document,
                      selectedPrintedPageIndex: printedPageIndex.value,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _EditorTabStrip(currentDocumentId: document.id),
                  ),
                  const SizedBox(width: 8),
                  const _TenaMainButton(),
                  const SizedBox(width: 8),
                  ValueListenableBuilder<int>(
                    valueListenable: printedPageIndex,
                    builder: (context, pageIndex, _) {
                      final strokeDocumentId = _strokeDocumentIdForPageIndex(
                        document,
                        pageIndex,
                      );
                      return Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _EditorIconButton(
                            icon: Icons.undo_rounded,
                            tooltip: '실행 취소',
                            enabled: state.canUndo(strokeDocumentId),
                            onPressed: () => state.undoStroke(strokeDocumentId),
                          ),
                          _EditorIconButton(
                            icon: Icons.redo_rounded,
                            tooltip: '다시 실행',
                            enabled: state.canRedo(strokeDocumentId),
                            onPressed: () => state.redoStroke(strokeDocumentId),
                          ),
                        ],
                      );
                    },
                  ),
                  _EditorIconButton(
                    icon: state.isDocumentFavorite(document.id)
                        ? Icons.bookmark_rounded
                        : Icons.bookmark_border_rounded,
                    tooltip: '북마크',
                    onPressed: () => state.toggleDocumentFavorite(document.id),
                  ),
                  _EditorIconButton(
                    icon: Icons.note_add_outlined,
                    tooltip: '페이지 추가',
                    onPressed: () => _showAddPagePanel(
                      context,
                      document: document,
                      currentPageIndex: printedPageIndex.value,
                      onPageInserted: onPrintedPageJump,
                    ),
                  ),
                  _EditorIconButton(
                    icon: Icons.more_horiz_rounded,
                    tooltip: '더보기',
                    onPressed: () => _showEditorMoreMenu(
                      context,
                      document,
                      selectedPrintedPageIndex: printedPageIndex.value,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _TenaMainButton extends StatelessWidget {
  const _TenaMainButton();

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: 'Tena calendar',
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () => context.go('/calendar'),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Center(
            child: Image.asset(
              'assets/tenaforge-mark-dark.png',
              width: 30,
              height: 30,
              fit: BoxFit.contain,
            ),
          ),
        ),
      ),
    );
  }
}

class _EditorTabStrip extends StatelessWidget {
  const _EditorTabStrip({required this.currentDocumentId});

  final String currentDocumentId;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<NoteLibraryState>();
    final documents = state.openDocuments;
    return Container(
      height: 46,
      color: AppColors.panel,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: documents.length,
        separatorBuilder: (_, _) =>
            const VerticalDivider(width: 1, color: AppColors.border),
        itemBuilder: (context, index) {
          final document = documents[index];
          final selected = document.id == currentDocumentId;
          return InkWell(
            onTap: () => context.go('/notes/editor/${document.id}'),
            child: Container(
              width: 156,
              color: selected ? AppColors.panelSoft : Colors.transparent,
              padding: const EdgeInsets.only(left: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      document.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: selected ? AppColors.text : AppColors.muted,
                        fontWeight: selected
                            ? FontWeight.w800
                            : FontWeight.w600,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: '탭 닫기',
                    visualDensity: VisualDensity.compact,
                    onPressed: () {
                      state.closeDocument(document.id);
                      if (document.id == currentDocumentId) {
                        final next = state.openDocuments.first;
                        context.go('/notes/editor/${next.id}');
                      }
                    },
                    icon: const Icon(Icons.close_rounded, size: 16),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _EditorToolBar extends StatelessWidget {
  const _EditorToolBar({
    required this.document,
    required this.printedPageIndex,
    required this.onPrintedPageJump,
  });

  final NoteDocument document;
  final ValueListenable<int> printedPageIndex;
  final ValueChanged<int> onPrintedPageJump;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<NoteLibraryState>();
    return Container(
      height: 56,
      color: AppColors.panel,
      child: Row(
        children: [
          Expanded(
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              children: [
                _ToolButton(
                  tool: NoteTool.pen,
                  icon: Icons.edit_outlined,
                  label: '펜',
                ),
                _ToolButton(
                  tool: NoteTool.eraser,
                  iconWidget: const _EraserToolIcon(),
                  label: '지우개',
                ),
                _ToolButton(
                  tool: NoteTool.highlighter,
                  icon: Icons.border_color_outlined,
                  label: '형광펜',
                ),
                _ToolButton(
                  tool: NoteTool.textExtractor,
                  icon: Icons.center_focus_strong_rounded,
                  iconWidget: const _AssetToolIcon(
                    'assets/text_extract_tool.png',
                  ),
                  label: '텍스트 추출',
                ),
                _ToolButton(
                  tool: NoteTool.lasso,
                  icon: Icons.gesture_rounded,
                  label: '올가미',
                ),
                _PhotoToolButton(
                  document: document,
                  printedPageIndex: printedPageIndex,
                ),
                _ToolButton(
                  tool: NoteTool.text,
                  icon: Icons.text_fields_rounded,
                  label: '텍스트',
                ),
                _ToolButton(
                  tool: NoteTool.pointer,
                  icon: Icons.flash_on_rounded,
                  iconWidget: const _AssetToolIcon(
                    'assets/laser_pointer_tool.png',
                  ),
                  label: '레이저 포인터',
                ),
                const SizedBox(width: 8),
                const VerticalDivider(color: AppColors.border),
                const SizedBox(width: 8),
                _StrokePreview(width: state.penWidth),
                SizedBox(
                  width: 130,
                  child: Slider(
                    min: 1,
                    max: 10,
                    value: state.penWidth,
                    onChanged: state.setPenWidth,
                  ),
                ),
              ],
            ),
          ),
          if (_pageRefsForDocument(document).length > 1)
            Padding(
              padding: const EdgeInsets.only(right: 18),
              child: ValueListenableBuilder<int>(
                valueListenable: printedPageIndex,
                builder: (context, index, _) {
                  final pageCount = _pageRefsForDocument(document).length;
                  final currentPage = index.clamp(0, pageCount - 1) + 1;
                  return _PrintedPageJumpControl(
                    currentPage: currentPage,
                    pageCount: pageCount,
                    onJump: onPrintedPageJump,
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

class _CanvasStage extends StatefulWidget {
  const _CanvasStage({
    required this.documentId,
    required this.onPrintedPageChanged,
    super.key,
  });

  final String documentId;
  final ValueChanged<int> onPrintedPageChanged;

  @override
  State<_CanvasStage> createState() => _CanvasStageState();
}

class _CanvasStageState extends State<_CanvasStage> {
  static const double _minStrokePointDistance = 0.45;
  static const double _maxStrokeSegmentDistance = 3.5;

  final GlobalKey _pageBoundaryKey = GlobalKey();
  final PageController _printedPageController = PageController();
  final Map<String, TransformationController> _transformControllers = {};
  List<Offset> _draftPoints = [];
  String? _draftDocumentId;
  int? _activeStrokePointer;
  Offset? _laserPoint;
  String? _laserDocumentId;
  Offset? _textInputPoint;
  String? _textInputDocumentId;
  TextEditingController? _textInputController;
  FocusNode? _textInputFocusNode;
  bool _extractingSelectionText = false;
  int _currentPrintedPageIndex = 0;
  bool _printedPageSwipeLocked = false;

  @override
  void didUpdateWidget(covariant _CanvasStage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.documentId == widget.documentId) return;
    _currentPrintedPageIndex = 0;
    _draftPoints = [];
    _draftDocumentId = null;
    _activeStrokePointer = null;
    _laserPoint = null;
    _laserDocumentId = null;
    _clearTextInput();
    _disposeTransformControllers();
    if (_printedPageController.hasClients) {
      _printedPageController.jumpToPage(0);
    }
    widget.onPrintedPageChanged(0);
  }

  @override
  void dispose() {
    _textInputController?.dispose();
    _textInputFocusNode?.dispose();
    _printedPageController.dispose();
    _disposeTransformControllers();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<NoteLibraryState>();
    final document = state.documentById(widget.documentId);
    final pageRefs = document == null
        ? const <String>[]
        : _pageRefsForDocument(document);

    return Container(
      color: AppColors.bg,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final pageSize = _pageSizeFor(
            constraints,
            printed: document?.printedPages.isNotEmpty ?? false,
          );
          if (pageRefs.length > 1 ||
              (document?.printedPages.isNotEmpty ?? false)) {
            final pageCount = pageRefs.length;
            final currentPage = _currentPrintedPageIndex.clamp(
              0,
              pageCount - 1,
            );
            final pageSwipeLocked =
                _printedPageSwipeLocked ||
                _locksPageSwipeForTool(state.selectedTool);
            return Stack(
              children: [
                PageView.builder(
                  controller: _printedPageController,
                  physics: pageSwipeLocked
                      ? const NeverScrollableScrollPhysics()
                      : const PageScrollPhysics(),
                  itemCount: pageCount,
                  onPageChanged: _handlePrintedPageChanged,
                  itemBuilder: (context, index) {
                    final pageRef = pageRefs[index];
                    final page = document == null
                        ? null
                        : _printedPageForRef(document, pageRef);
                    final strokeDocumentId = _strokeDocumentIdForPageRef(
                      widget.documentId,
                      pageRef,
                    );
                    return _buildZoomableCanvasViewport(
                      transformId: strokeDocumentId,
                      panEnabled: false,
                      child: _buildCanvasPage(
                        context: context,
                        state: state,
                        strokeDocumentId: strokeDocumentId,
                        width: pageSize.width,
                        height: pageSize.height,
                        printedPage: page,
                        boundaryKey: index == currentPage
                            ? _pageBoundaryKey
                            : null,
                      ),
                    );
                  },
                ),
              ],
            );
          }
          final pageRef = pageRefs.isEmpty
              ? 'blank:${widget.documentId}'
              : pageRefs.first;
          return _buildZoomableCanvasViewport(
            transformId: _strokeDocumentIdForPageRef(
              widget.documentId,
              pageRef,
            ),
            panEnabled: false,
            child: _buildCanvasPage(
              context: context,
              state: state,
              strokeDocumentId: _strokeDocumentIdForPageRef(
                widget.documentId,
                pageRef,
              ),
              width: pageSize.width,
              height: pageSize.height,
              boundaryKey: _pageBoundaryKey,
            ),
          );
        },
      ),
    );
  }

  Size _pageSizeFor(BoxConstraints constraints, {required bool printed}) {
    final availableWidth = math.max(constraints.maxWidth - 42, 280.0);
    final availableHeight = math.max(constraints.maxHeight - 42, 180.0);
    final aspectRatio = printed ? 16 / 9 : 1 / 1.414;
    var width = availableWidth;
    var height = width / aspectRatio;
    if (height > availableHeight) {
      height = availableHeight;
      width = height * aspectRatio;
    }
    return Size(math.max(width, 280.0), math.max(height, 180.0));
  }

  Widget _buildZoomableCanvasViewport({
    required String transformId,
    required bool panEnabled,
    required Widget child,
  }) {
    return ClipRect(
      child: InteractiveViewer(
        transformationController: _transformControllerFor(transformId),
        boundaryMargin: const EdgeInsets.all(360),
        minScale: 0.65,
        maxScale: 5,
        panEnabled: panEnabled,
        scaleEnabled: true,
        trackpadScrollCausesScale: true,
        child: SizedBox.expand(child: Center(child: child)),
      ),
    );
  }

  Widget _buildCanvasPage({
    required BuildContext context,
    required NoteLibraryState state,
    required String strokeDocumentId,
    required double width,
    required double height,
    PrintedNotePage? printedPage,
    GlobalKey? boundaryKey,
  }) {
    final strokes = state.strokesFor(strokeDocumentId);
    final draftStroke = _buildDraftStroke(state, strokeDocumentId);
    final handlesPrecisionPan =
        state.selectedTool == NoteTool.pen ||
        state.selectedTool == NoteTool.highlighter ||
        state.selectedTool == NoteTool.textExtractor ||
        state.selectedTool == NoteTool.pointer;
    return Stack(
      children: [
        SizedBox(
          width: width,
          height: height,
          child: Listener(
            behavior: HitTestBehavior.opaque,
            onPointerDown: (event) =>
                _handlePointerDown(context, event, strokeDocumentId),
            onPointerMove: handlesPrecisionPan ? _handlePointerMove : null,
            onPointerUp: handlesPrecisionPan
                ? (event) => _handlePointerUp(context, event)
                : null,
            onPointerCancel: handlesPrecisionPan
                ? (event) => _handlePointerCancel(event)
                : null,
            child: Stack(
              children: [
                RepaintBoundary(
                  key: boundaryKey,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      CustomPaint(
                        painter: const _NotebookPageBackgroundPainter(),
                        child: const SizedBox.expand(),
                      ),
                      if (printedPage != null)
                        _PrintedProblemPage(page: printedPage),
                      if (strokes.any((stroke) => stroke.isImage))
                        _ImageStrokeLayer(strokes: strokes),
                      CustomPaint(
                        painter: _NotebookPagePainter(strokes: strokes),
                        child: const SizedBox.expand(),
                      ),
                    ],
                  ),
                ),
                if (draftStroke != null)
                  IgnorePointer(
                    child: CustomPaint(
                      painter: _StrokeOverlayPainter(draftStroke),
                      child: const SizedBox.expand(),
                    ),
                  ),
                if (_extractingSelectionText &&
                    _draftDocumentId == strokeDocumentId)
                  const Positioned(
                    right: 12,
                    top: 12,
                    child: _SelectionExtractionBadge(),
                  ),
                if (_laserDocumentId == strokeDocumentId && _laserPoint != null)
                  IgnorePointer(
                    child: CustomPaint(
                      painter: _LaserPointerPainter(_laserPoint!),
                      child: const SizedBox.expand(),
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (_textInputPoint != null &&
            _textInputDocumentId == strokeDocumentId &&
            _textInputController != null &&
            _textInputFocusNode != null)
          Positioned(
            left: math
                .min(_textInputPoint!.dx, width - 220)
                .clamp(0.0, width)
                .toDouble(),
            top: math
                .min(_textInputPoint!.dy, height - 52)
                .clamp(0.0, height)
                .toDouble(),
            child: SizedBox(
              width: math.min(260, width),
              child: TextField(
                controller: _textInputController,
                focusNode: _textInputFocusNode,
                autofocus: true,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _commitTextInput(context),
                style: const TextStyle(
                  color: AppColors.text,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
                decoration: InputDecoration(
                  hintText: '텍스트 입력',
                  filled: true,
                  fillColor: AppColors.panel,
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: AppColors.border),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(color: AppColors.border),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(
                      color: AppColors.text,
                      width: 1.5,
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  TransformationController _transformControllerFor(String id) {
    return _transformControllers.putIfAbsent(id, () {
      final controller = TransformationController();
      controller.addListener(_handleTransformChanged);
      return controller;
    });
  }

  void _handleTransformChanged() {
    final locked = _transformControllers.values.any(
      (controller) => controller.value.getMaxScaleOnAxis() > 1.02,
    );
    if (locked == _printedPageSwipeLocked || !mounted) return;
    setState(() => _printedPageSwipeLocked = locked);
  }

  void _disposeTransformControllers() {
    for (final controller in _transformControllers.values) {
      controller.dispose();
    }
    _transformControllers.clear();
    _printedPageSwipeLocked = false;
  }

  void _handlePrintedPageChanged(int index) {
    setState(() {
      _currentPrintedPageIndex = index;
      _draftPoints = [];
      _draftDocumentId = null;
      _activeStrokePointer = null;
      _clearTextInput();
    });
    widget.onPrintedPageChanged(index);
  }

  void jumpToPrintedPage(int pageNumber) {
    final document = context.read<NoteLibraryState>().documentById(
      widget.documentId,
    );
    final pageCount = document == null
        ? 0
        : _pageRefsForDocument(document).length;
    if (pageCount <= 0) return;
    final index = pageNumber.clamp(1, pageCount).toInt() - 1;
    if (_currentPrintedPageIndex != index) {
      setState(() => _currentPrintedPageIndex = index);
      widget.onPrintedPageChanged(index);
    }
    if (!_printedPageController.hasClients) return;
    _printedPageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 240),
      curve: Curves.easeOutCubic,
    );
  }

  NoteStroke? _buildDraftStroke(NoteLibraryState state, String documentId) {
    if (_draftDocumentId != documentId) return null;
    if (_draftPoints.isEmpty) return null;
    final extractingText = state.selectedTool == NoteTool.textExtractor;
    final highlighting = state.selectedTool == NoteTool.highlighter;
    return NoteStroke(
      points: _draftPoints,
      color: extractingText
          ? const Color(0x6634D399)
          : highlighting
          ? const Color(0x66FACC15)
          : state.inkColor,
      width: extractingText
          ? math.max(14, state.penWidth * 4)
          : highlighting
          ? state.penWidth * 4
          : state.penWidth,
      isHighlighter: highlighting || extractingText,
    );
  }

  bool _isStrokeTool(NoteTool tool) {
    return tool == NoteTool.pen ||
        tool == NoteTool.highlighter ||
        tool == NoteTool.textExtractor;
  }

  bool _requiresPrecisionInput(NoteTool tool) {
    return tool == NoteTool.pen ||
        tool == NoteTool.highlighter ||
        tool == NoteTool.textExtractor ||
        tool == NoteTool.pointer ||
        tool == NoteTool.eraser;
  }

  bool _isPrecisionInput(PointerEvent event) {
    if (event.kind == ui.PointerDeviceKind.stylus ||
        event.kind == ui.PointerDeviceKind.invertedStylus) {
      return true;
    }
    if (event.kind != ui.PointerDeviceKind.mouse) return false;
    if (kIsWeb) return true;
    return defaultTargetPlatform == TargetPlatform.macOS ||
        defaultTargetPlatform == TargetPlatform.windows ||
        defaultTargetPlatform == TargetPlatform.linux;
  }

  void _handlePointerDown(
    BuildContext context,
    PointerDownEvent event,
    String strokeDocumentId,
  ) {
    if (_extractingSelectionText) return;
    final state = context.read<NoteLibraryState>();
    if (_requiresPrecisionInput(state.selectedTool) &&
        !_isPrecisionInput(event)) {
      return;
    }
    if (state.selectedTool == NoteTool.pointer) {
      if (_activeStrokePointer != null) return;
      setState(() {
        _activeStrokePointer = event.pointer;
        _laserPoint = event.localPosition;
        _laserDocumentId = strokeDocumentId;
        _clearTextInput();
      });
      return;
    }
    if (_isStrokeTool(state.selectedTool)) {
      if (_activeStrokePointer != null) return;
      _activeStrokePointer = event.pointer;
      _startStroke(context, event.localPosition, strokeDocumentId);
      return;
    }
    _handleTap(context, event.localPosition, strokeDocumentId);
  }

  void _handlePointerMove(PointerMoveEvent event) {
    if (_activeStrokePointer != event.pointer) return;
    if (_laserDocumentId != null) {
      setState(() => _laserPoint = event.localPosition);
      return;
    }
    _updateStroke(event.localPosition);
  }

  void _handlePointerUp(BuildContext context, PointerUpEvent event) {
    if (_activeStrokePointer != event.pointer) return;
    if (_laserDocumentId != null) {
      setState(() {
        _activeStrokePointer = null;
        _laserPoint = null;
        _laserDocumentId = null;
      });
      return;
    }
    _activeStrokePointer = null;
    _finishStroke(context);
  }

  void _handlePointerCancel(PointerCancelEvent event) {
    if (_activeStrokePointer != event.pointer) return;
    setState(() {
      _activeStrokePointer = null;
      _draftPoints = [];
      _draftDocumentId = null;
      _laserPoint = null;
      _laserDocumentId = null;
    });
  }

  void _handleTap(BuildContext context, Offset point, String strokeDocumentId) {
    final state = context.read<NoteLibraryState>();
    switch (state.selectedTool) {
      case NoteTool.text:
        _beginTextInput(context, point, strokeDocumentId);
      case NoteTool.eraser:
        state.eraseLastStroke(strokeDocumentId);
      case NoteTool.textExtractor:
      case NoteTool.lasso:
      case NoteTool.image:
      case NoteTool.pointer:
        _showSnack(context, '${_toolLabel(state.selectedTool)} 도구를 선택했습니다.');
      case NoteTool.pen:
      case NoteTool.highlighter:
        break;
    }
  }

  void _startStroke(
    BuildContext context,
    Offset point,
    String strokeDocumentId,
  ) {
    if (_extractingSelectionText) return;
    final state = context.read<NoteLibraryState>();
    switch (state.selectedTool) {
      case NoteTool.pen:
      case NoteTool.highlighter:
      case NoteTool.textExtractor:
        setState(() {
          _draftPoints = [point];
          _draftDocumentId = strokeDocumentId;
          _clearTextInput();
        });
      case NoteTool.eraser:
        state.eraseLastStroke(strokeDocumentId);
      case NoteTool.text:
      case NoteTool.lasso:
      case NoteTool.image:
      case NoteTool.pointer:
        break;
    }
  }

  void _updateStroke(Offset point) {
    if (_extractingSelectionText) return;
    final state = context.read<NoteLibraryState>();
    if (state.selectedTool == NoteTool.pen ||
        state.selectedTool == NoteTool.highlighter ||
        state.selectedTool == NoteTool.textExtractor) {
      setState(() => _appendDraftPoint(point));
    }
  }

  void _appendDraftPoint(Offset point) {
    if (_draftPoints.isEmpty) {
      _draftPoints.add(point);
      return;
    }
    final last = _draftPoints.last;
    final distance = (point - last).distance;
    if (distance < _minStrokePointDistance) return;

    final insertedPoints = math.min(
      24,
      math.max(0, (distance / _maxStrokeSegmentDistance).floor()),
    );
    for (var index = 1; index <= insertedPoints; index += 1) {
      final t = index / (insertedPoints + 1);
      _draftPoints.add(Offset.lerp(last, point, t)!);
    }
    _draftPoints.add(point);
  }

  void _finishStroke(BuildContext context) {
    final state = context.read<NoteLibraryState>();
    if (state.selectedTool == NoteTool.textExtractor) {
      final selectionPoints = List<Offset>.from(_draftPoints);
      if (selectionPoints.length < 4) {
        _showSnack(context, '텍스트를 원으로 감싸 주세요.');
        setState(() {
          _draftPoints = [];
          _draftDocumentId = null;
        });
        return;
      }
      _extractTextFromSelection(selectionPoints);
      return;
    }
    if (_draftPoints.length > 1) {
      final strokeDocumentId = _draftDocumentId ?? widget.documentId;
      state.addStroke(
        strokeDocumentId,
        NoteStroke(
          points: List<Offset>.unmodifiable(_draftPoints),
          color: state.selectedTool == NoteTool.highlighter
              ? const Color(0x66FACC15)
              : state.inkColor,
          width: state.selectedTool == NoteTool.highlighter
              ? state.penWidth * 4
              : state.penWidth,
          isHighlighter: state.selectedTool == NoteTool.highlighter,
        ),
      );
    }
    setState(() {
      _draftPoints = [];
      _draftDocumentId = null;
      _activeStrokePointer = null;
    });
  }

  Future<void> _extractTextFromSelection(List<Offset> selectionPoints) async {
    setState(() => _extractingSelectionText = true);
    try {
      final pngBytes = await _captureSelectionPng(selectionPoints);
      if (pngBytes == null || pngBytes.isEmpty) {
        if (mounted) _showSnack(context, '선택 영역을 캡처하지 못했습니다.');
        return;
      }
      if (!mounted) return;
      final text = await context
          .read<StudentAppState>()
          .extractNoteSelectionText(base64Encode(pngBytes));
      if (!mounted) return;
      if (text.trim().isEmpty) {
        _showSnack(context, '인식된 텍스트가 없습니다.');
        return;
      }
      await Clipboard.setData(ClipboardData(text: text.trim()));
      if (mounted) {
        _showSnack(context, '추출한 텍스트를 클립보드에 복사했습니다.');
      }
    } catch (error) {
      if (!mounted) return;
      final message = error is ApiException
          ? error.displayMessage
          : '텍스트 추출에 실패했습니다.';
      _showSnack(context, message);
    } finally {
      await Future<void>.delayed(const Duration(milliseconds: 450));
      if (mounted) {
        setState(() {
          _extractingSelectionText = false;
          _draftPoints = [];
          _draftDocumentId = null;
        });
      }
    }
  }

  Future<Uint8List?> _captureSelectionPng(List<Offset> points) async {
    final boundary = _pageBoundaryKey.currentContext?.findRenderObject();
    if (boundary is! RenderRepaintBoundary) return null;
    final logicalSize = boundary.size;
    if (logicalSize.isEmpty) return null;
    final selectionRect = _selectionRect(points, logicalSize);
    if (selectionRect.width < 12 || selectionRect.height < 12) return null;

    final image = await boundary.toImage(pixelRatio: 2);
    ui.Image? croppedImage;
    try {
      final scaleX = image.width / logicalSize.width;
      final scaleY = image.height / logicalSize.height;
      final sourceRect =
          Rect.fromLTRB(
            selectionRect.left * scaleX,
            selectionRect.top * scaleY,
            selectionRect.right * scaleX,
            selectionRect.bottom * scaleY,
          ).intersect(
            Rect.fromLTWH(
              0,
              0,
              image.width.toDouble(),
              image.height.toDouble(),
            ),
          );
      if (sourceRect.width < 16 || sourceRect.height < 16) return null;

      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);
      final destinationRect = Rect.fromLTWH(
        0,
        0,
        sourceRect.width,
        sourceRect.height,
      );
      canvas.drawImageRect(image, sourceRect, destinationRect, Paint());
      croppedImage = await recorder.endRecording().toImage(
        sourceRect.width.ceil(),
        sourceRect.height.ceil(),
      );
      final byteData = await croppedImage.toByteData(
        format: ui.ImageByteFormat.png,
      );
      return byteData?.buffer.asUint8List();
    } finally {
      image.dispose();
      croppedImage?.dispose();
    }
  }

  Rect _selectionRect(List<Offset> points, Size bounds) {
    var left = bounds.width;
    var top = bounds.height;
    var right = 0.0;
    var bottom = 0.0;
    for (final point in points) {
      left = math.min(left, point.dx);
      top = math.min(top, point.dy);
      right = math.max(right, point.dx);
      bottom = math.max(bottom, point.dy);
    }
    final padded = Rect.fromLTRB(left, top, right, bottom).inflate(18);
    return Rect.fromLTRB(
      padded.left.clamp(0.0, bounds.width),
      padded.top.clamp(0.0, bounds.height),
      padded.right.clamp(0.0, bounds.width),
      padded.bottom.clamp(0.0, bounds.height),
    );
  }

  void _beginTextInput(
    BuildContext context,
    Offset point,
    String strokeDocumentId,
  ) {
    _commitTextInput(context);
    final controller = TextEditingController();
    final focusNode = FocusNode();
    setState(() {
      _textInputPoint = point;
      _textInputDocumentId = strokeDocumentId;
      _textInputController = controller;
      _textInputFocusNode = focusNode;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) focusNode.requestFocus();
    });
  }

  void _commitTextInput(BuildContext context) {
    final point = _textInputPoint;
    final controller = _textInputController;
    final strokeDocumentId = _textInputDocumentId ?? widget.documentId;
    if (point != null && controller != null) {
      context.read<NoteLibraryState>().addTextAt(
        strokeDocumentId,
        point,
        controller.text,
      );
    }
    if (!mounted) {
      _clearTextInput();
      return;
    }
    setState(_clearTextInput);
  }

  void _clearTextInput() {
    _textInputController?.dispose();
    _textInputFocusNode?.dispose();
    _textInputController = null;
    _textInputFocusNode = null;
    _textInputPoint = null;
    _textInputDocumentId = null;
  }
}

class _ToolButton extends StatelessWidget {
  const _ToolButton({
    required this.tool,
    required this.label,
    this.icon,
    this.iconWidget,
  }) : assert(icon != null || iconWidget != null);

  final NoteTool tool;
  final IconData? icon;
  final String label;
  final Widget? iconWidget;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<NoteLibraryState>();
    return _PassiveToolButton(
      icon: icon,
      iconWidget: iconWidget,
      tooltip: label,
      selected: state.selectedTool == tool,
      onPressed: () => state.selectTool(tool),
    );
  }
}

class _PhotoToolButton extends StatelessWidget {
  const _PhotoToolButton({
    required this.document,
    required this.printedPageIndex,
  });

  final NoteDocument document;
  final ValueListenable<int> printedPageIndex;

  @override
  Widget build(BuildContext context) {
    return _PassiveToolButton(
      icon: Icons.image_outlined,
      tooltip: '사진 추가',
      onPressed: () => _pickAndInsertPhoto(context),
    );
  }

  Future<void> _pickAndInsertPhoto(BuildContext context) async {
    try {
      final picked = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 1800,
        imageQuality: 86,
      );
      if (picked == null) return;

      final bytes = await picked.readAsBytes();
      if (!context.mounted) return;
      if (bytes.isEmpty) {
        _showSnack(context, '이미지를 읽지 못했습니다.');
        return;
      }

      final originalSize = await _imageSizeFor(bytes);
      if (!context.mounted) return;
      final aspectRatio = originalSize.width <= 0 || originalSize.height <= 0
          ? 1.0
          : originalSize.width / originalSize.height;
      final displayWidth = math.min(420.0, math.max(220.0, originalSize.width));
      final displayHeight = displayWidth / aspectRatio;
      final strokeDocumentId = _strokeDocumentIdForPageIndex(
        document,
        printedPageIndex.value,
      );

      context.read<NoteLibraryState>().addImageAt(
        strokeDocumentId,
        point: const Offset(140, 140),
        imageData: base64Encode(bytes),
        mimeType: picked.mimeType ?? _mimeTypeForImageName(picked.name),
        imageWidth: displayWidth,
        imageHeight: displayHeight,
      );
      context.read<NoteLibraryState>().selectTool(NoteTool.pen);
    } catch (_) {
      if (context.mounted) {
        _showSnack(context, '사진을 추가하지 못했습니다.');
      }
    }
  }
}

class _PassiveToolButton extends StatelessWidget {
  const _PassiveToolButton({
    required this.tooltip,
    required this.onPressed,
    this.icon,
    this.iconWidget,
    this.selected = false,
  }) : assert(icon != null || iconWidget != null);

  final IconData? icon;
  final String tooltip;
  final VoidCallback onPressed;
  final Widget? iconWidget;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final iconColor = selected ? AppColors.panel : AppColors.text;
    return Tooltip(
      message: tooltip,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 3),
        child: IconButton(
          onPressed: onPressed,
          style: IconButton.styleFrom(
            backgroundColor: selected ? AppColors.text : Colors.transparent,
            foregroundColor: selected ? AppColors.panel : AppColors.text,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(7),
            ),
          ),
          icon: IconTheme(
            data: IconThemeData(color: iconColor, size: 24),
            child: iconWidget ?? Icon(icon),
          ),
        ),
      ),
    );
  }
}

class _EraserToolIcon extends StatelessWidget {
  const _EraserToolIcon();

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size.square(24),
      painter: _EraserToolPainter(
        IconTheme.of(context).color ?? AppColors.text,
      ),
    );
  }
}

class _AssetToolIcon extends StatelessWidget {
  const _AssetToolIcon(this.assetPath);

  final String assetPath;

  @override
  Widget build(BuildContext context) {
    return ImageIcon(AssetImage(assetPath), size: 24);
  }
}

class _EraserToolPainter extends CustomPainter {
  const _EraserToolPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    canvas
      ..save()
      ..translate(size.width / 2, size.height / 2)
      ..rotate(-math.pi / 4)
      ..translate(-size.width / 2, -size.height / 2);

    final body = RRect.fromRectAndRadius(
      Rect.fromLTWH(7, 4, 10, 15),
      const Radius.circular(2.5),
    );
    canvas
      ..drawRRect(body, stroke)
      ..drawLine(const Offset(7, 10), const Offset(17, 10), stroke)
      ..restore()
      ..drawLine(const Offset(5, 20), const Offset(19, 20), stroke);
  }

  @override
  bool shouldRepaint(covariant _EraserToolPainter oldDelegate) =>
      oldDelegate.color != color;
}

class _EditorIconButton extends StatelessWidget {
  const _EditorIconButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.enabled = true,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: IconButton(
        onPressed: enabled ? onPressed : null,
        icon: Icon(icon, color: enabled ? AppColors.text : AppColors.subtle),
      ),
    );
  }
}

class _PrintedPageJumpControl extends StatefulWidget {
  const _PrintedPageJumpControl({
    required this.currentPage,
    required this.pageCount,
    required this.onJump,
  });

  final int currentPage;
  final int pageCount;
  final ValueChanged<int> onJump;

  @override
  State<_PrintedPageJumpControl> createState() =>
      _PrintedPageJumpControlState();
}

class _PrintedPageJumpControlState extends State<_PrintedPageJumpControl> {
  late final TextEditingController _controller;
  late final FocusNode _focusNode;
  bool _editing = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: '${widget.currentPage}');
    _focusNode = FocusNode()..addListener(_handleFocusChanged);
  }

  @override
  void didUpdateWidget(covariant _PrintedPageJumpControl oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_editing) return;
    if (oldWidget.currentPage != widget.currentPage ||
        _controller.text != '${widget.currentPage}') {
      _controller.text = '${widget.currentPage}';
    }
  }

  @override
  void dispose() {
    _focusNode.removeListener(_handleFocusChanged);
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const pageTextStyle = TextStyle(
      color: AppColors.text,
      fontSize: 13,
      fontWeight: FontWeight.w900,
      height: 1,
    );
    const pageTextStrut = StrutStyle(
      fontSize: 13,
      height: 1,
      forceStrutHeight: true,
    );
    final numberWidth = math.max(
      18.0,
      widget.pageCount.toString().length * 8.0 + 8.0,
    );

    return SizedBox(
      height: 36,
      child: Center(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            SizedBox(
              width: numberWidth,
              height: 20,
              child: Center(
                child: _editing
                    ? TextField(
                        controller: _controller,
                        focusNode: _focusNode,
                        textAlign: TextAlign.center,
                        textAlignVertical: TextAlignVertical.center,
                        keyboardType: TextInputType.number,
                        textInputAction: TextInputAction.go,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                        ],
                        onSubmitted: (_) => _finishEditing(),
                        onTap: _selectCurrentValue,
                        style: pageTextStyle,
                        strutStyle: pageTextStrut,
                        cursorHeight: 14,
                        decoration: const InputDecoration(
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          isCollapsed: true,
                          contentPadding: EdgeInsets.zero,
                        ),
                      )
                    : GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: _beginEditing,
                        child: Text(
                          '${widget.currentPage}',
                          textAlign: TextAlign.center,
                          strutStyle: pageTextStrut,
                          style: pageTextStyle,
                        ),
                      ),
              ),
            ),
            const SizedBox(width: 2),
            Text(
              '/ ${widget.pageCount}',
              strutStyle: pageTextStrut,
              style: pageTextStyle.copyWith(color: AppColors.muted),
            ),
          ],
        ),
      ),
    );
  }

  void _beginEditing() {
    if (_editing) return;
    setState(() => _editing = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _focusNode.requestFocus();
      _selectCurrentValue();
    });
  }

  void _selectCurrentValue() {
    _controller.selection = TextSelection(
      baseOffset: 0,
      extentOffset: _controller.text.length,
    );
  }

  void _finishEditing({bool unfocus = true}) {
    _submit();
    if (!mounted) return;
    if (_editing) {
      setState(() => _editing = false);
    }
    if (unfocus) {
      _focusNode.unfocus();
    }
  }

  void _handleFocusChanged() {
    if (!_focusNode.hasFocus && _editing) {
      _finishEditing(unfocus: false);
    }
  }

  void _submit() {
    final parsed = int.tryParse(_controller.text);
    final nextPage = (parsed ?? widget.currentPage)
        .clamp(1, widget.pageCount)
        .toInt();
    _controller.text = '$nextPage';
    _controller.selection = TextSelection.collapsed(
      offset: _controller.text.length,
    );
    widget.onJump(nextPage);
  }
}

class _StrokePreview extends StatelessWidget {
  const _StrokePreview({required this.width});

  final double width;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 48,
      child: Center(
        child: Container(
          width: 8 + width * 2,
          height: 8 + width * 2,
          decoration: const BoxDecoration(
            color: AppColors.text,
            shape: BoxShape.circle,
          ),
        ),
      ),
    );
  }
}

class _NotebookPageBackgroundPainter extends CustomPainter {
  const _NotebookPageBackgroundPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final pageRect = Offset.zero & size;
    canvas.drawRect(pageRect, Paint()..color = Colors.white);
    canvas.drawRect(
      pageRect.deflate(0.5),
      Paint()
        ..color = const Color(0xFFE5E7EB)
        ..style = PaintingStyle.stroke,
    );
  }

  @override
  bool shouldRepaint(covariant _NotebookPageBackgroundPainter oldDelegate) =>
      false;
}

class _PrintedProblemPage extends StatelessWidget {
  const _PrintedProblemPage({required this.page});

  final PrintedNotePage page;

  @override
  Widget build(BuildContext context) {
    final body = (page.body ?? '').trim();
    return LayoutBuilder(
      builder: (context, constraints) {
        final horizontalPadding = math.max(constraints.maxWidth * 0.06, 34.0);
        final verticalPadding = math.max(constraints.maxHeight * 0.08, 28.0);
        final bodyStyle = TextStyle(
          color: AppColors.text,
          fontSize: _problemBodyFontSize(body, constraints.maxWidth),
          height: 1.45,
          fontWeight: FontWeight.w700,
        );
        return Padding(
          padding: EdgeInsets.symmetric(
            horizontal: horizontalPadding,
            vertical: verticalPadding,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DecoratedBox(
                decoration: BoxDecoration(
                  color: AppColors.text,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  child: Text(
                    page.title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      height: 1,
                    ),
                  ),
                ),
              ),
              SizedBox(height: math.max(constraints.maxHeight * 0.09, 24.0)),
              Expanded(
                child: Align(
                  alignment: Alignment.topLeft,
                  child: _ProblemMathText(
                    text: body.isEmpty ? '문항 내용이 없습니다.' : body,
                    style: bodyStyle.copyWith(
                      color: body.isEmpty ? AppColors.muted : AppColors.text,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  double _problemBodyFontSize(String body, double width) {
    final length = body.runes.length;
    if (width >= 780 && length <= 90) return 31;
    if (width >= 640 && length <= 160) return 27;
    if (length <= 260) return 23;
    return 20;
  }
}

class _ProblemMathText extends StatelessWidget {
  const _ProblemMathText({required this.text, required this.style});

  final String text;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    final spans = <InlineSpan>[];
    for (final segment in _splitMathSegments(text)) {
      if (segment.isMath) {
        spans.add(
          WidgetSpan(
            alignment: PlaceholderAlignment.middle,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 1.5),
              child: Math.tex(
                segment.text,
                mathStyle: segment.display ? MathStyle.display : MathStyle.text,
                textStyle: style.copyWith(fontWeight: FontWeight.w700),
                onErrorFallback: (_) => Text(
                  segment.raw,
                  style: style.copyWith(
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
        );
      } else {
        spans.add(TextSpan(text: segment.text, style: style));
      }
    }
    return Text.rich(
      TextSpan(children: spans),
      softWrap: true,
      overflow: TextOverflow.visible,
      textAlign: TextAlign.start,
    );
  }
}

class _MathTextSegment {
  const _MathTextSegment.text(this.text)
    : isMath = false,
      display = false,
      raw = text;

  const _MathTextSegment.math({
    required this.text,
    required this.raw,
    required this.display,
  }) : isMath = true;

  final String text;
  final String raw;
  final bool isMath;
  final bool display;
}

List<_MathTextSegment> _splitMathSegments(String value) {
  final segments = <_MathTextSegment>[];
  var cursor = 0;
  while (cursor < value.length) {
    final start = value.indexOf(r'$', cursor);
    if (start < 0) {
      if (cursor < value.length) {
        segments.add(_MathTextSegment.text(value.substring(cursor)));
      }
      break;
    }
    if (start > cursor) {
      segments.add(_MathTextSegment.text(value.substring(cursor, start)));
    }
    final display = start + 1 < value.length && value[start + 1] == r'$';
    final markerLength = display ? 2 : 1;
    final marker = display ? r'$$' : r'$';
    final contentStart = start + markerLength;
    final end = value.indexOf(marker, contentStart);
    if (end < 0) {
      segments.add(_MathTextSegment.text(value.substring(start)));
      break;
    }
    final raw = value.substring(start, end + markerLength);
    final tex = value.substring(contentStart, end).trim();
    if (tex.isEmpty) {
      segments.add(_MathTextSegment.text(raw));
    } else {
      segments.add(
        _MathTextSegment.math(text: tex, raw: raw, display: display),
      );
    }
    cursor = end + markerLength;
  }
  return segments;
}

void _drawStrokePath(Canvas canvas, List<Offset> points, Paint paint) {
  if (points.isEmpty) return;
  if (points.length == 1) {
    canvas.drawCircle(points.first, paint.strokeWidth / 2, paint);
    return;
  }
  if (points.length == 2) {
    canvas.drawLine(points.first, points.last, paint);
    return;
  }

  final path = Path()..moveTo(points.first.dx, points.first.dy);
  for (var index = 1; index < points.length - 1; index += 1) {
    final current = points[index];
    final next = points[index + 1];
    final midpoint = Offset(
      (current.dx + next.dx) / 2,
      (current.dy + next.dy) / 2,
    );
    path.quadraticBezierTo(current.dx, current.dy, midpoint.dx, midpoint.dy);
  }
  path.lineTo(points.last.dx, points.last.dy);
  canvas.drawPath(path, paint);
}

class _ImageStrokeLayer extends StatelessWidget {
  const _ImageStrokeLayer({required this.strokes});

  final List<NoteStroke> strokes;

  @override
  Widget build(BuildContext context) {
    final imageWidgets = <Widget>[];
    for (final stroke in strokes) {
      if (!stroke.isImage || stroke.points.isEmpty) continue;
      Uint8List bytes;
      try {
        bytes = base64Decode(stroke.imageData!);
      } catch (_) {
        continue;
      }
      final point = stroke.points.first;
      final width = stroke.imageWidth ?? 320;
      final height = stroke.imageHeight ?? 220;
      imageWidgets.add(
        Positioned(
          left: point.dx,
          top: point.dy,
          width: width,
          height: height,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.memory(
              bytes,
              fit: BoxFit.contain,
              gaplessPlayback: true,
            ),
          ),
        ),
      );
    }
    if (imageWidgets.isEmpty) return const SizedBox.shrink();
    return Stack(children: imageWidgets);
  }
}

class _NotebookPagePainter extends CustomPainter {
  const _NotebookPagePainter({required this.strokes});

  final List<NoteStroke> strokes;

  @override
  void paint(Canvas canvas, Size size) {
    for (final stroke in strokes) {
      _drawStroke(canvas, stroke);
    }
  }

  void _drawStroke(Canvas canvas, NoteStroke stroke) {
    if (stroke.isImage) return;
    if (stroke.text != null && stroke.points.isNotEmpty) {
      final painter = TextPainter(
        text: TextSpan(
          text: stroke.text,
          style: TextStyle(
            color: stroke.color,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      painter.paint(canvas, stroke.points.first);
      return;
    }

    final paint = Paint()
      ..color = stroke.color
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..strokeWidth = stroke.width
      ..style = PaintingStyle.stroke;

    _drawStrokePath(canvas, stroke.points, paint);
  }

  @override
  bool shouldRepaint(covariant _NotebookPagePainter oldDelegate) =>
      oldDelegate.strokes != strokes;
}

class _StrokeOverlayPainter extends CustomPainter {
  const _StrokeOverlayPainter(this.stroke);

  final NoteStroke stroke;

  @override
  void paint(Canvas canvas, Size size) {
    if (stroke.points.length < 2) return;
    final paint = Paint()
      ..color = stroke.color
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..strokeWidth = stroke.width
      ..style = PaintingStyle.stroke;
    _drawStrokePath(canvas, stroke.points, paint);
  }

  @override
  bool shouldRepaint(covariant _StrokeOverlayPainter oldDelegate) =>
      oldDelegate.stroke != stroke;
}

class _LaserPointerPainter extends CustomPainter {
  const _LaserPointerPainter(this.point);

  final Offset point;

  @override
  void paint(Canvas canvas, Size size) {
    final glow = Paint()
      ..color = const Color(0x44EF4444)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12);
    final core = Paint()..color = const Color(0xFFEF4444);
    final ring = Paint()
      ..color = const Color(0xCCEF4444)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.2;

    canvas.drawCircle(point, 18, glow);
    canvas.drawCircle(point, 8, core);
    canvas.drawCircle(point, 15, ring);
  }

  @override
  bool shouldRepaint(covariant _LaserPointerPainter oldDelegate) =>
      oldDelegate.point != point;
}

class _SelectionExtractionBadge extends StatelessWidget {
  const _SelectionExtractionBadge();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFFECFDF5),
        border: Border.all(color: const Color(0xFF34D399)),
        borderRadius: BorderRadius.circular(999),
      ),
      child: const Padding(
        padding: EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 12,
              height: 12,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Color(0xFF059669),
              ),
            ),
            SizedBox(width: 7),
            Text(
              '추출 중',
              style: TextStyle(
                color: Color(0xFF065F46),
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

List<String> _pageRefsForDocument(NoteDocument document) {
  if (document.pageRefs.isNotEmpty) return document.pageRefs;
  if (document.printedPages.isNotEmpty) {
    return document.printedPages
        .map((page) => _printedPageRef(page))
        .toList(growable: false);
  }
  return [_blankPageRef(document.id)];
}

String _printedPageRef(PrintedNotePage page) => 'printed:${page.problemId}';

String _blankPageRef(String pageId) => 'blank:$pageId';

String _strokeDocumentIdForPageIndex(NoteDocument document, int pageIndex) {
  final pageRefs = _pageRefsForDocument(document);
  if (pageRefs.isEmpty) return document.id;
  final safeIndex = pageIndex.clamp(0, pageRefs.length - 1).toInt();
  return _strokeDocumentIdForPageRef(document.id, pageRefs[safeIndex]);
}

bool _locksPageSwipeForTool(NoteTool tool) {
  return tool == NoteTool.pen ||
      tool == NoteTool.highlighter ||
      tool == NoteTool.textExtractor ||
      tool == NoteTool.pointer ||
      tool == NoteTool.eraser;
}

Future<Size> _imageSizeFor(Uint8List bytes) async {
  final codec = await ui.instantiateImageCodec(bytes);
  final frame = await codec.getNextFrame();
  final image = frame.image;
  final size = Size(image.width.toDouble(), image.height.toDouble());
  image.dispose();
  return size;
}

String _mimeTypeForImageName(String name) {
  final lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
}

PrintedNotePage? _printedPageForRef(NoteDocument document, String pageRef) {
  if (!pageRef.startsWith('printed:')) return null;
  final problemId = pageRef.substring('printed:'.length);
  for (final page in document.printedPages) {
    if (page.problemId == problemId) return page;
  }
  return null;
}

String _strokeDocumentIdForPageRef(String documentId, String pageRef) {
  if (pageRef.startsWith('printed:')) {
    final problemId = pageRef.substring('printed:'.length);
    return '$documentId::problem-$problemId';
  }
  if (pageRef.startsWith('blank:')) {
    final pageId = pageRef.substring('blank:'.length);
    if (pageId == documentId) return documentId;
    return '$documentId::$pageId';
  }
  return documentId;
}

void _showShareExportPanel(
  BuildContext context, {
  required NoteDocument document,
  required int selectedPrintedPageIndex,
}) {
  showGeneralDialog<void>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.10),
    barrierDismissible: true,
    barrierLabel: '공유 및 내보내기 닫기',
    transitionDuration: const Duration(milliseconds: 140),
    pageBuilder: (dialogContext, _, _) {
      final media = MediaQuery.sizeOf(dialogContext);
      final width = math.min(media.width - 24, 480.0);
      final desiredLeft = media.width < 700 ? 12.0 : 72.0;
      final left = math.max(
        12.0,
        math.min(desiredLeft, media.width - width - 12),
      );

      return SafeArea(
        child: Stack(
          children: [
            Positioned(
              top: 58,
              left: left,
              child: _ShareExportSheet(
                document: document,
                selectedPrintedPageIndex: selectedPrintedPageIndex,
                width: width,
                onAction: (message) {
                  if (context.mounted) _showSnack(context, message);
                },
              ),
            ),
          ],
        ),
      );
    },
    transitionBuilder: (context, animation, _, child) => FadeTransition(
      opacity: CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
      child: SlideTransition(
        position: Tween<Offset>(begin: const Offset(0, -0.04), end: Offset.zero)
            .animate(
              CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
            ),
        child: child,
      ),
    ),
  );
}

class _ShareExportSheet extends StatefulWidget {
  const _ShareExportSheet({
    required this.document,
    required this.selectedPrintedPageIndex,
    required this.width,
    required this.onAction,
  });

  final NoteDocument document;
  final int selectedPrintedPageIndex;
  final double width;
  final ValueChanged<String> onAction;

  @override
  State<_ShareExportSheet> createState() => _ShareExportSheetState();
}

class _ShareExportSheetState extends State<_ShareExportSheet> {
  bool _collaborationEnabled = false;
  int _presentationMode = 1;

  @override
  Widget build(BuildContext context) {
    final pageCount = math.max(_pageRefsForDocument(widget.document).length, 1);
    final currentPage =
        widget.selectedPrintedPageIndex.clamp(0, pageCount - 1).toInt() + 1;

    return Material(
      color: Colors.transparent,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            top: -7,
            left: math.min(142.0, widget.width - 60),
            child: Transform.rotate(
              angle: math.pi / 4,
              child: Container(
                width: 16,
                height: 16,
                decoration: BoxDecoration(
                  color: AppColors.panel,
                  border: Border.all(color: AppColors.border),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
          ),
          Container(
            width: widget.width,
            constraints: const BoxConstraints(maxHeight: 720),
            decoration: BoxDecoration(
              color: AppColors.panel,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.border),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x26000000),
                  blurRadius: 28,
                  offset: Offset(0, 16),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            '공유 및 내보내기',
                            style: TextStyle(
                              color: AppColors.text,
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            widget.document.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.muted,
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Divider(height: 1, color: AppColors.border),
                    const _ShareExportSectionLabel('협업'),
                    _ShareExportAction(
                      icon: Icons.person_add_alt_1_rounded,
                      title: '협업 링크 공유',
                      subtitle: '보기, 댓글, 편집 권한으로 공유',
                      trailing: Switch.adaptive(
                        value: _collaborationEnabled,
                        activeThumbColor: AppColors.text,
                        activeTrackColor: AppColors.border,
                        onChanged: (value) =>
                            setState(() => _collaborationEnabled = value),
                      ),
                      onTap: () => setState(
                        () => _collaborationEnabled = !_collaborationEnabled,
                      ),
                    ),
                    const _ShareExportSectionLabel('내보내기'),
                    _ShareExportAction(
                      icon: Icons.file_upload_outlined,
                      title: '현재 페이지 내보내기',
                      subtitle: '$currentPage / $pageCount 페이지',
                      onTap: () => _finish('현재 페이지 내보내기 준비 상태입니다.'),
                    ),
                    _ShareExportAction(
                      icon: Icons.library_books_outlined,
                      title: '전체 페이지 내보내기',
                      subtitle: '총 $pageCount페이지',
                      onTap: () => _finish('전체 페이지 내보내기 준비 상태입니다.'),
                    ),
                    _ShareExportAction(
                      icon: Icons.print_rounded,
                      title: '인쇄',
                      trailing: const Icon(
                        Icons.chevron_right_rounded,
                        color: AppColors.subtle,
                      ),
                      onTap: () => _finish('인쇄 준비 상태입니다.'),
                    ),
                    const _ShareExportSectionLabel('프레젠테이션 모드'),
                    _ShareExportAction(
                      icon: Icons.connected_tv_rounded,
                      title: '전체 화면 미러링',
                      subtitle: '보는 화면 전체를 표시',
                      trailing: _presentationMode == 0
                          ? const Icon(
                              Icons.check_rounded,
                              color: AppColors.cyan,
                            )
                          : null,
                      onTap: () => setState(() => _presentationMode = 0),
                    ),
                    _ShareExportAction(
                      icon: Icons.present_to_all_rounded,
                      title: '발표자 페이지 미러링',
                      subtitle: '툴바 없이 페이지 중심으로 표시',
                      trailing: _presentationMode == 1
                          ? const Icon(
                              Icons.check_rounded,
                              color: AppColors.cyan,
                            )
                          : null,
                      onTap: () => setState(() => _presentationMode = 1),
                    ),
                    _ShareExportAction(
                      icon: Icons.fit_screen_rounded,
                      title: '전체 페이지 미러링',
                      subtitle: '확대 상태와 무관하게 페이지 전체 표시',
                      trailing: _presentationMode == 2
                          ? const Icon(
                              Icons.check_rounded,
                              color: AppColors.cyan,
                            )
                          : null,
                      onTap: () => setState(() => _presentationMode = 2),
                    ),
                    const SizedBox(height: 10),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _finish(String message) {
    Navigator.of(context).pop();
    widget.onAction(message);
  }
}

class _ShareExportSectionLabel extends StatelessWidget {
  const _ShareExportSectionLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
      child: Text(
        label,
        style: const TextStyle(
          color: AppColors.muted,
          fontSize: 12,
          fontWeight: FontWeight.w900,
          letterSpacing: 0,
        ),
      ),
    );
  }
}

class _ShareExportAction extends StatelessWidget {
  const _ShareExportAction({
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.trailing,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 13),
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: AppColors.border)),
          ),
          child: Row(
            children: [
              SizedBox(
                width: 42,
                height: 42,
                child: Icon(icon, color: AppColors.text, size: 27),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.text,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 3),
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.muted,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 12), trailing!],
            ],
          ),
        ),
      ),
    );
  }
}

void _showDocumentSearch(
  BuildContext context, {
  required NoteDocument document,
  required int selectedPrintedPageIndex,
  required ValueChanged<int> onPrintedPageJump,
}) {
  showGeneralDialog<void>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.12),
    barrierDismissible: true,
    barrierLabel: '검색 닫기',
    transitionDuration: const Duration(milliseconds: 140),
    pageBuilder: (context, _, _) => SafeArea(
      child: Align(
        alignment: Alignment.topCenter,
        child: Padding(
          padding: const EdgeInsets.only(top: 64, left: 18, right: 18),
          child: _DocumentSearchSheet(
            document: document,
            selectedPrintedPageIndex: selectedPrintedPageIndex,
            onPrintedPageJump: onPrintedPageJump,
          ),
        ),
      ),
    ),
    transitionBuilder: (context, animation, _, child) => FadeTransition(
      opacity: CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
      child: SlideTransition(
        position: Tween<Offset>(begin: const Offset(0, -0.04), end: Offset.zero)
            .animate(
              CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
            ),
        child: child,
      ),
    ),
  );
}

class _DocumentSearchSheet extends StatefulWidget {
  const _DocumentSearchSheet({
    required this.document,
    required this.selectedPrintedPageIndex,
    required this.onPrintedPageJump,
  });

  final NoteDocument document;
  final int selectedPrintedPageIndex;
  final ValueChanged<int> onPrintedPageJump;

  @override
  State<_DocumentSearchSheet> createState() => _DocumentSearchSheetState();
}

class _DocumentSearchSheetState extends State<_DocumentSearchSheet> {
  late final TextEditingController _controller;
  late final FocusNode _focusNode;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
    _focusNode = FocusNode();
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<NoteLibraryState>();
    final query = _controller.text;
    final results = _searchDocument(state, widget.document, query);
    final width = math.min(MediaQuery.sizeOf(context).width - 36, 560.0);
    final maxHeight = math.min(MediaQuery.sizeOf(context).height - 104, 520.0);

    return Material(
      color: Colors.transparent,
      child: Container(
        width: width,
        constraints: BoxConstraints(maxHeight: maxHeight),
        decoration: BoxDecoration(
          color: AppColors.panel,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
          boxShadow: const [
            BoxShadow(
              color: Color(0x24000000),
              blurRadius: 24,
              offset: Offset(0, 14),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                child: TextField(
                  controller: _controller,
                  focusNode: _focusNode,
                  autofocus: true,
                  textInputAction: TextInputAction.search,
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (_) => _openFirstResult(results),
                  decoration: InputDecoration(
                    hintText: '검색어 입력',
                    prefixIcon: const Icon(Icons.search_rounded, size: 22),
                    suffixIcon: query.isEmpty
                        ? null
                        : IconButton(
                            tooltip: '검색어 지우기',
                            onPressed: () {
                              _controller.clear();
                              setState(() {});
                              _focusNode.requestFocus();
                            },
                            icon: const Icon(Icons.close_rounded, size: 20),
                          ),
                    filled: true,
                    fillColor: AppColors.panelSoft,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 13,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide.none,
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(
                        color: AppColors.text,
                        width: 1.3,
                      ),
                    ),
                  ),
                ),
              ),
              const Divider(height: 1, color: AppColors.border),
              Flexible(
                child: _DocumentSearchResults(
                  query: query,
                  results: results,
                  selectedPrintedPageIndex: widget.selectedPrintedPageIndex,
                  onResultTap: _openResult,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _openFirstResult(List<_DocumentSearchResult> results) {
    if (results.isEmpty) return;
    _openResult(results.first);
  }

  void _openResult(_DocumentSearchResult result) {
    widget.onPrintedPageJump(result.pageIndex + 1);
    Navigator.of(context).pop();
  }
}

class _DocumentSearchResults extends StatelessWidget {
  const _DocumentSearchResults({
    required this.query,
    required this.results,
    required this.selectedPrintedPageIndex,
    required this.onResultTap,
  });

  final String query;
  final List<_DocumentSearchResult> results;
  final int selectedPrintedPageIndex;
  final ValueChanged<_DocumentSearchResult> onResultTap;

  @override
  Widget build(BuildContext context) {
    if (query.trim().isEmpty) {
      return const _DocumentSearchEmpty(message: '검색어를 입력하세요.');
    }
    if (results.isEmpty) {
      return const _DocumentSearchEmpty(message: '검색 결과가 없습니다.');
    }

    return ListView.separated(
      shrinkWrap: true,
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: results.length,
      separatorBuilder: (_, _) =>
          const Divider(height: 1, color: AppColors.border),
      itemBuilder: (context, index) {
        final result = results[index];
        final selected = result.pageIndex == selectedPrintedPageIndex;
        return InkWell(
          onTap: () => onResultTap(result),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: selected ? AppColors.text : AppColors.panelSoft,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${result.pageIndex + 1}',
                    style: TextStyle(
                      color: selected ? AppColors.panel : AppColors.text,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              result.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: AppColors.text,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          if (selected)
                            const Padding(
                              padding: EdgeInsets.only(left: 8),
                              child: Text(
                                '현재',
                                style: TextStyle(
                                  color: AppColors.muted,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        result.snippet,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.muted,
                          fontSize: 13,
                          height: 1.25,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _DocumentSearchEmpty extends StatelessWidget {
  const _DocumentSearchEmpty({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 34),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: const TextStyle(
          color: AppColors.muted,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _DocumentSearchResult {
  const _DocumentSearchResult({
    required this.pageIndex,
    required this.title,
    required this.snippet,
  });

  final int pageIndex;
  final String title;
  final String snippet;
}

List<_DocumentSearchResult> _searchDocument(
  NoteLibraryState state,
  NoteDocument document,
  String rawQuery,
) {
  final query = rawQuery.trim().toLowerCase();
  if (query.isEmpty) return const [];

  final pageRefs = _pageRefsForDocument(document);
  final results = <_DocumentSearchResult>[];
  for (var index = 0; index < pageRefs.length; index += 1) {
    final pageRef = pageRefs[index];
    final printedPage = _printedPageForRef(document, pageRef);
    final strokeDocumentId = _strokeDocumentIdForPageRef(document.id, pageRef);
    final textStrokes = state
        .strokesFor(strokeDocumentId)
        .map((stroke) => stroke.text?.trim())
        .whereType<String>()
        .where((text) => text.isNotEmpty);

    final chunks = <String>[
      document.title,
      if (printedPage != null) '${printedPage.pageNumber}번',
      if (printedPage != null) printedPage.title,
      if (printedPage?.body?.trim().isNotEmpty ?? false) printedPage!.body!,
      if (printedPage?.sourceLabel?.trim().isNotEmpty ?? false)
        printedPage!.sourceLabel!,
      if (printedPage != null) ...printedPage.tags,
      ...textStrokes,
    ].where((text) => text.trim().isNotEmpty).toList(growable: false);

    final haystack = chunks.join('\n').toLowerCase();
    if (!haystack.contains(query)) continue;

    final fallbackTitle = '페이지 ${index + 1}';
    final title = printedPage == null
        ? fallbackTitle
        : '${printedPage.pageNumber}번 ${printedPage.title}';
    final snippet = _bestSearchSnippet(chunks, query, fallbackTitle);
    results.add(
      _DocumentSearchResult(pageIndex: index, title: title, snippet: snippet),
    );
  }
  return results;
}

String _bestSearchSnippet(List<String> chunks, String query, String fallback) {
  for (final chunk in chunks) {
    final trimmed = chunk.trim();
    if (trimmed.toLowerCase().contains(query)) {
      return trimmed.length <= 120
          ? trimmed
          : '${trimmed.substring(0, 117)}...';
    }
  }
  for (final chunk in chunks) {
    final trimmed = chunk.trim();
    if (trimmed.isNotEmpty) {
      return trimmed.length <= 120
          ? trimmed
          : '${trimmed.substring(0, 117)}...';
    }
  }
  return fallback;
}

void _showAddPagePanel(
  BuildContext context, {
  required NoteDocument document,
  required int currentPageIndex,
  required ValueChanged<int> onPageInserted,
}) {
  showGeneralDialog<void>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.18),
    barrierDismissible: true,
    barrierLabel: '페이지 추가 닫기',
    transitionDuration: const Duration(milliseconds: 160),
    pageBuilder: (context, _, _) => SafeArea(
      child: Align(
        alignment: Alignment.topRight,
        child: Padding(
          padding: const EdgeInsets.only(top: 60, right: 18),
          child: _AddPageSheet(
            document: document,
            currentPageIndex: currentPageIndex,
            onPageInserted: onPageInserted,
          ),
        ),
      ),
    ),
    transitionBuilder: (context, animation, _, child) => FadeTransition(
      opacity: CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
      child: SlideTransition(
        position:
            Tween<Offset>(
              begin: const Offset(0.03, -0.03),
              end: Offset.zero,
            ).animate(
              CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
            ),
        child: child,
      ),
    ),
  );
}

class _AddPageSheet extends StatefulWidget {
  const _AddPageSheet({
    required this.document,
    required this.currentPageIndex,
    required this.onPageInserted,
  });

  final NoteDocument document;
  final int currentPageIndex;
  final ValueChanged<int> onPageInserted;

  @override
  State<_AddPageSheet> createState() => _AddPageSheetState();
}

class _AddPageSheetState extends State<_AddPageSheet> {
  NotePageInsertPosition _position = NotePageInsertPosition.after;

  @override
  Widget build(BuildContext context) {
    final width = math.min(MediaQuery.sizeOf(context).width - 36, 620.0);
    final maxHeight = math.min(MediaQuery.sizeOf(context).height - 96, 620.0);
    return Material(
      color: Colors.transparent,
      child: Container(
        width: width,
        constraints: BoxConstraints(maxHeight: maxHeight),
        decoration: BoxDecoration(
          color: AppColors.panel,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
          boxShadow: const [
            BoxShadow(
              color: Color(0x24000000),
              blurRadius: 24,
              offset: Offset(0, 14),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(
                    child: Text(
                      '페이지 추가',
                      style: TextStyle(
                        color: AppColors.text,
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  _AddPageSegmentedControl(
                    value: _position,
                    onChanged: (value) => setState(() => _position = value),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    height: 188,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      children: [
                        _AddPageTemplateCard(
                          title: '현재 서식',
                          icon: Icons.keyboard_alt_outlined,
                          selected: _position != NotePageInsertPosition.last,
                          onTap: _insertBlankPage,
                        ),
                        const SizedBox(width: 18),
                        _AddPageTemplateCard(
                          title: '빈 페이지',
                          icon: Icons.add_rounded,
                          selected: _position == NotePageInsertPosition.after,
                          onTap: _insertBlankPage,
                        ),
                        const SizedBox(width: 18),
                        _AddPageTemplateCard(
                          title: '마지막 빈 페이지',
                          icon: Icons.last_page_rounded,
                          selected: _position == NotePageInsertPosition.last,
                          onTap: _insertAtLastPage,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  _AddPageActionRow(
                    icon: Icons.dashboard_customize_outlined,
                    label: '템플릿 더 보기',
                    onTap: _showComingSoon,
                  ),
                  _AddPageActionRow(
                    icon: Icons.image_outlined,
                    label: '이미지',
                    onTap: _showComingSoon,
                  ),
                  _AddPageActionRow(
                    icon: Icons.document_scanner_outlined,
                    label: '문서 스캔',
                    onTap: _showComingSoon,
                  ),
                  _AddPageActionRow(
                    icon: Icons.photo_camera_outlined,
                    label: '사진 촬영',
                    onTap: _showComingSoon,
                  ),
                  _AddPageActionRow(
                    icon: Icons.file_upload_outlined,
                    label: '가져오기',
                    onTap: _showComingSoon,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _insertAtLastPage() {
    setState(() => _position = NotePageInsertPosition.last);
    _insertBlankPage();
  }

  void _insertBlankPage() {
    final insertedPage = context.read<NoteLibraryState>().addBlankPage(
      widget.document.id,
      position: _position,
      currentPageIndex: widget.currentPageIndex,
    );
    Navigator.pop(context);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.onPageInserted(insertedPage);
    });
  }

  void _showComingSoon() {
    final messenger = ScaffoldMessenger.of(context);
    Navigator.pop(context);
    messenger.showSnackBar(
      const SnackBar(content: Text('이 페이지 추가 방식은 준비 중입니다.')),
    );
  }
}

class _AddPageSegmentedControl extends StatelessWidget {
  const _AddPageSegmentedControl({
    required this.value,
    required this.onChanged,
  });

  final NotePageInsertPosition value;
  final ValueChanged<NotePageInsertPosition> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 44,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.panelSoft,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          _AddPageSegmentButton(
            label: '이전',
            selected: value == NotePageInsertPosition.before,
            onTap: () => onChanged(NotePageInsertPosition.before),
          ),
          _AddPageSegmentButton(
            label: '다음',
            selected: value == NotePageInsertPosition.after,
            onTap: () => onChanged(NotePageInsertPosition.after),
          ),
          _AddPageSegmentButton(
            label: '마지막',
            selected: value == NotePageInsertPosition.last,
            onTap: () => onChanged(NotePageInsertPosition.last),
          ),
        ],
      ),
    );
  }
}

class _AddPageSegmentButton extends StatelessWidget {
  const _AddPageSegmentButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 140),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? AppColors.text : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? AppColors.panel : AppColors.text,
              fontSize: 14,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ),
    );
  }
}

class _AddPageTemplateCard extends StatelessWidget {
  const _AddPageTemplateCard({
    required this.title,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String title;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 132,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 132,
              height: 146,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: selected ? AppColors.text : AppColors.border,
                  width: selected ? 1.8 : 1,
                ),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x0F000000),
                    blurRadius: 12,
                    offset: Offset(0, 7),
                  ),
                ],
              ),
              child: Stack(
                children: [
                  const Positioned(
                    left: 16,
                    right: 16,
                    top: 18,
                    child: Column(
                      children: [
                        _TemplatePreviewLine(widthFactor: 1),
                        SizedBox(height: 9),
                        _TemplatePreviewLine(widthFactor: 0.74),
                      ],
                    ),
                  ),
                  Positioned(
                    right: 10,
                    top: 10,
                    child: Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: AppColors.text,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(icon, color: Colors.white, size: 17),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 9),
            Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: AppColors.text,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TemplatePreviewLine extends StatelessWidget {
  const _TemplatePreviewLine({required this.widthFactor});

  final double widthFactor;

  @override
  Widget build(BuildContext context) {
    return FractionallySizedBox(
      widthFactor: widthFactor,
      alignment: Alignment.centerLeft,
      child: Container(
        height: 6,
        decoration: BoxDecoration(
          color: AppColors.panelSoft,
          borderRadius: BorderRadius.circular(999),
        ),
      ),
    );
  }
}

class _AddPageActionRow extends StatelessWidget {
  const _AddPageActionRow({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        height: 54,
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: AppColors.border)),
        ),
        child: Row(
          children: [
            Icon(icon, color: AppColors.text, size: 24),
            const SizedBox(width: 18),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  color: AppColors.text,
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

void _showPageOverview(
  BuildContext context,
  String documentId, {
  required int selectedPrintedPageIndex,
  required ValueChanged<int> onPrintedPageJump,
}) {
  showDialog<void>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.28),
    builder: (context) => _PageOverviewDialog(
      documentId: documentId,
      selectedPrintedPageIndex: selectedPrintedPageIndex,
      onPrintedPageJump: onPrintedPageJump,
    ),
  );
}

class _PageOverviewDialog extends StatefulWidget {
  const _PageOverviewDialog({
    required this.documentId,
    required this.selectedPrintedPageIndex,
    required this.onPrintedPageJump,
  });

  final String documentId;
  final int selectedPrintedPageIndex;
  final ValueChanged<int> onPrintedPageJump;

  @override
  State<_PageOverviewDialog> createState() => _PageOverviewDialogState();
}

class _PageOverviewDialogState extends State<_PageOverviewDialog> {
  int _section = 0;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.sizeOf(context);
    final panelWidth = math.min(media.width - 96, 1080.0);
    final panelHeight = math.min(media.height - 116, 760.0);

    return Dialog(
      insetPadding: const EdgeInsets.all(48),
      backgroundColor: AppColors.panel,
      surfaceTintColor: Colors.transparent,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: AppColors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: SizedBox(
        width: panelWidth,
        height: panelHeight,
        child: Column(
          children: [
            Container(
              height: 64,
              decoration: const BoxDecoration(
                color: AppColors.panel,
                border: Border(bottom: BorderSide(color: AppColors.border)),
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                      style: TextButton.styleFrom(
                        foregroundColor: AppColors.text,
                        textStyle: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Close'),
                    ),
                  ),
                  _OverviewSegmentedControl(
                    value: _section,
                    onChanged: (value) => setState(() => _section = value),
                  ),
                  const Align(
                    alignment: Alignment.centerRight,
                    child: Padding(
                      padding: EdgeInsets.only(right: 12),
                      child: Text(
                        'Select',
                        style: TextStyle(
                          color: AppColors.text,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _section == 0
                  ? _ThumbnailOverview(
                      documentId: widget.documentId,
                      selectedPrintedPageIndex: widget.selectedPrintedPageIndex,
                      onPrintedPageJump: widget.onPrintedPageJump,
                    )
                  : Center(
                      child: Text(
                        _section == 1 ? 'No favorites yet' : 'No outlines yet',
                        style: const TextStyle(
                          color: AppColors.muted,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OverviewSegmentedControl extends StatelessWidget {
  const _OverviewSegmentedControl({
    required this.value,
    required this.onChanged,
  });

  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 38,
      decoration: BoxDecoration(
        color: AppColors.panelSoft,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _OverviewSegment(
            label: 'Thumbnails',
            selected: value == 0,
            onTap: () => onChanged(0),
          ),
          _OverviewSegment(
            label: 'Favorites',
            selected: value == 1,
            onTap: () => onChanged(1),
          ),
          _OverviewSegment(
            label: 'Outlines',
            selected: value == 2,
            onTap: () => onChanged(2),
          ),
        ],
      ),
    );
  }
}

class _OverviewSegment extends StatelessWidget {
  const _OverviewSegment({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(7),
      onTap: onTap,
      child: Container(
        width: 116,
        height: 34,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? AppColors.text : Colors.transparent,
          borderRadius: BorderRadius.circular(7),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? AppColors.panel : AppColors.text,
            fontWeight: selected ? FontWeight.w800 : FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _ThumbnailOverview extends StatelessWidget {
  const _ThumbnailOverview({
    required this.documentId,
    required this.selectedPrintedPageIndex,
    required this.onPrintedPageJump,
  });

  final String documentId;
  final int selectedPrintedPageIndex;
  final ValueChanged<int> onPrintedPageJump;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<NoteLibraryState>();
    final document = state.documentById(documentId);
    final pageRefs = document == null
        ? const <String>[]
        : _pageRefsForDocument(document);
    final selectedIndex = pageRefs.isEmpty
        ? 0
        : selectedPrintedPageIndex.clamp(0, pageRefs.length - 1).toInt();

    return LayoutBuilder(
      builder: (context, constraints) {
        final pageCards = pageRefs.asMap().entries.map((entry) {
          final index = entry.key;
          final pageRef = entry.value;
          final printedPage = document == null
              ? null
              : _printedPageForRef(document, pageRef);
          return _PageThumbnailCard(
            pageNumber: index + 1,
            strokes: state.strokesFor(
              _strokeDocumentIdForPageRef(documentId, pageRef),
            ),
            selected: index == selectedIndex,
            printedPage: printedPage,
            onTap: () {
              onPrintedPageJump(index + 1);
              Navigator.pop(context);
            },
          );
        });
        final children = pageRefs.isEmpty
            ? <Widget>[
                _PageThumbnailCard(
                  pageNumber: 1,
                  strokes: state.strokesFor(documentId),
                  selected: true,
                ),
                const _AddPageTile(),
              ]
            : pageCards.toList(growable: false);

        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(34, 28, 34, 32),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minWidth: math.max(constraints.maxWidth - 68, 0),
            ),
            child: Align(
              alignment: Alignment.topLeft,
              child: Wrap(spacing: 34, runSpacing: 30, children: children),
            ),
          ),
        );
      },
    );
  }
}

class _PageThumbnailCard extends StatelessWidget {
  const _PageThumbnailCard({
    required this.pageNumber,
    required this.strokes,
    required this.selected,
    this.printedPage,
    this.onTap,
  });

  final int pageNumber;
  final List<NoteStroke> strokes;
  final bool selected;
  final PrintedNotePage? printedPage;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 150,
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 150,
              height: 212,
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                color: AppColors.panel,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: selected ? AppColors.text : AppColors.border,
                  width: 2,
                ),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: _ThumbnailPagePreview(
                  strokes: strokes,
                  printedPage: printedPage,
                ),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Text(
                  '$pageNumber',
                  style: const TextStyle(
                    color: AppColors.text,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const Spacer(),
                const Icon(
                  Icons.keyboard_arrow_down_rounded,
                  color: AppColors.muted,
                  size: 18,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ThumbnailPagePreview extends StatelessWidget {
  const _ThumbnailPagePreview({required this.strokes, this.printedPage});

  final List<NoteStroke> strokes;
  final PrintedNotePage? printedPage;

  @override
  Widget build(BuildContext context) {
    final printedPage = this.printedPage;
    if (printedPage != null) {
      const sourceWidth = 660.0;
      const sourceHeight = sourceWidth * 1.414;
      return FittedBox(
        fit: BoxFit.contain,
        alignment: Alignment.topCenter,
        child: SizedBox(
          width: sourceWidth,
          height: sourceHeight,
          child: Stack(
            fit: StackFit.expand,
            children: [
              CustomPaint(painter: const _NotebookPageBackgroundPainter()),
              _PrintedProblemPage(page: printedPage),
              CustomPaint(painter: _NotebookPagePainter(strokes: strokes)),
            ],
          ),
        ),
      );
    }
    return CustomPaint(
      painter: _ThumbnailPagePainter(strokes),
      child: const SizedBox.expand(),
    );
  }
}

class _ThumbnailPagePainter extends CustomPainter {
  const _ThumbnailPagePainter(this.strokes);

  final List<NoteStroke> strokes;

  @override
  void paint(Canvas canvas, Size size) {
    const sourceWidth = 660.0;
    const sourceHeight = sourceWidth * 1.414;
    final scale = math.min(
      size.width / sourceWidth,
      size.height / sourceHeight,
    );
    final dx = (size.width - sourceWidth * scale) / 2;
    final dy = (size.height - sourceHeight * scale) / 2;

    canvas
      ..save()
      ..translate(dx, dy)
      ..scale(scale);
    _NotebookPagePainter(
      strokes: strokes,
    ).paint(canvas, const Size(sourceWidth, sourceHeight));
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _ThumbnailPagePainter oldDelegate) =>
      oldDelegate.strokes != strokes;
}

class _AddPageTile extends StatelessWidget {
  const _AddPageTile();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          width: 170,
          height: 212,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: AppColors.panelSoft,
              borderRadius: BorderRadius.circular(8),
            ),
            child: CustomPaint(
              painter: const _DashedBorderPainter(color: AppColors.text),
              child: const Center(
                child: Icon(Icons.add_rounded, color: AppColors.text, size: 44),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  const _DashedBorderPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    const dash = 6.0;
    const gap = 6.0;
    final rect = RRect.fromRectAndRadius(
      Offset.zero & size,
      const Radius.circular(8),
    );
    final path = Path()..addRRect(rect);
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        final next = math.min(distance + dash, metric.length);
        canvas.drawPath(metric.extractPath(distance, next), paint);
        distance += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color;
}

void _showEditorMoreMenu(
  BuildContext context,
  NoteDocument document, {
  required int selectedPrintedPageIndex,
}) async {
  final selected = await showMenu<String>(
    context: context,
    position: const RelativeRect.fromLTRB(260, 96, 16, 0),
    items: const [
      PopupMenuItem(value: 'clear', child: Text('페이지 비우기')),
      PopupMenuItem(value: 'export', child: Text('내보내기')),
    ],
  );
  if (!context.mounted || selected == null) return;
  switch (selected) {
    case 'clear':
      context.read<NoteLibraryState>().clearPage(
        _strokeDocumentIdForPageIndex(document, selectedPrintedPageIndex),
      );
    case 'export':
      _showShareExportPanel(
        context,
        document: document,
        selectedPrintedPageIndex: selectedPrintedPageIndex,
      );
  }
}

String _toolLabel(NoteTool tool) {
  switch (tool) {
    case NoteTool.pen:
      return '펜';
    case NoteTool.eraser:
      return '지우개';
    case NoteTool.highlighter:
      return '형광펜';
    case NoteTool.textExtractor:
      return '텍스트 추출';
    case NoteTool.lasso:
      return '올가미';
    case NoteTool.image:
      return '이미지';
    case NoteTool.text:
      return '텍스트';
    case NoteTool.pointer:
      return '포인터';
  }
}

void _showSnack(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}
