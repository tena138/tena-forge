import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_math_fork/flutter_math.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
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
            _EditorTopBar(document: document),
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
  const _EditorTopBar({required this.document});

  final NoteDocument document;

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
                    onPressed: () => _showPageOverview(context, document.id),
                  ),
                  _EditorIconButton(
                    icon: Icons.search_rounded,
                    tooltip: '검색',
                    onPressed: () => _showSnack(context, '노트 내 검색을 열었습니다.'),
                  ),
                  _EditorIconButton(
                    icon: Icons.ios_share_rounded,
                    tooltip: '공유',
                    onPressed: () =>
                        _showSnack(context, '${document.title} 공유 메뉴를 열었습니다.'),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _EditorTabStrip(currentDocumentId: document.id),
                  ),
                  const SizedBox(width: 8),
                  const _TenaMainButton(),
                  const SizedBox(width: 8),
                  _EditorIconButton(
                    icon: Icons.undo_rounded,
                    tooltip: '실행 취소',
                    enabled: state.canUndo(document.id),
                    onPressed: () => state.undoStroke(document.id),
                  ),
                  _EditorIconButton(
                    icon: Icons.redo_rounded,
                    tooltip: '다시 실행',
                    enabled: state.canRedo(document.id),
                    onPressed: () => state.redoStroke(document.id),
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
                    tooltip: '새 노트',
                    onPressed: () {
                      final next = state.addNotebook(
                        folderId: document.folderId,
                      );
                      context.go('/notes/editor/${next.id}');
                    },
                  ),
                  _EditorIconButton(
                    icon: Icons.more_horiz_rounded,
                    tooltip: '더보기',
                    onPressed: () => _showEditorMoreMenu(context, document.id),
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
                _PassiveToolButton(
                  icon: Icons.add_photo_alternate_outlined,
                  tooltip: '페이지/이미지 추가',
                  onPressed: () =>
                      _showSnack(context, '페이지 또는 이미지를 추가할 수 있습니다.'),
                ),
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
                  label: '텍스트 추출',
                ),
                _ToolButton(
                  tool: NoteTool.lasso,
                  icon: Icons.gesture_rounded,
                  label: '올가미',
                ),
                _ToolButton(
                  tool: NoteTool.image,
                  icon: Icons.image_outlined,
                  label: '이미지',
                ),
                _ToolButton(
                  tool: NoteTool.text,
                  icon: Icons.text_fields_rounded,
                  label: '텍스트',
                ),
                _ToolButton(
                  tool: NoteTool.pointer,
                  icon: Icons.flash_on_rounded,
                  label: '포인터',
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
          if (document.printedPages.length > 1)
            Padding(
              padding: const EdgeInsets.only(right: 18),
              child: ValueListenableBuilder<int>(
                valueListenable: printedPageIndex,
                builder: (context, index, _) {
                  final pageCount = document.printedPages.length;
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
  final GlobalKey _pageBoundaryKey = GlobalKey();
  final PageController _printedPageController = PageController();
  final Map<String, TransformationController> _transformControllers = {};
  List<Offset> _draftPoints = [];
  String? _draftDocumentId;
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
    final printedPages = document?.printedPages ?? const <PrintedNotePage>[];

    return Container(
      color: AppColors.bg,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final pageSize = _pageSizeFor(
            constraints,
            printed: printedPages.isNotEmpty,
          );
          if (printedPages.isNotEmpty) {
            final pageCount = printedPages.length;
            final currentPage = _currentPrintedPageIndex.clamp(
              0,
              pageCount - 1,
            );
            return Stack(
              children: [
                PageView.builder(
                  controller: _printedPageController,
                  physics: _printedPageSwipeLocked
                      ? const NeverScrollableScrollPhysics()
                      : const PageScrollPhysics(),
                  itemCount: pageCount,
                  onPageChanged: _handlePrintedPageChanged,
                  itemBuilder: (context, index) {
                    final page = printedPages[index];
                    final strokeDocumentId = _printedPageStrokeId(
                      widget.documentId,
                      page,
                    );
                    return _buildZoomableCanvasViewport(
                      transformId: strokeDocumentId,
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
          return _buildZoomableCanvasViewport(
            transformId: widget.documentId,
            child: _buildCanvasPage(
              context: context,
              state: state,
              strokeDocumentId: widget.documentId,
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
    required Widget child,
  }) {
    return ClipRect(
      child: InteractiveViewer(
        transformationController: _transformControllerFor(transformId),
        boundaryMargin: const EdgeInsets.all(360),
        minScale: 0.65,
        maxScale: 5,
        panEnabled: true,
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
    final handlesStrokePan =
        state.selectedTool == NoteTool.pen ||
        state.selectedTool == NoteTool.highlighter ||
        state.selectedTool == NoteTool.textExtractor;
    return Stack(
      children: [
        SizedBox(
          width: width,
          height: height,
          child: GestureDetector(
            onTapDown: (details) =>
                _handleTap(context, details.localPosition, strokeDocumentId),
            onPanStart: handlesStrokePan
                ? (details) => _startStroke(
                    context,
                    details.localPosition,
                    strokeDocumentId,
                  )
                : null,
            onPanUpdate: handlesStrokePan
                ? (details) => _updateStroke(details.localPosition)
                : null,
            onPanEnd: handlesStrokePan ? (_) => _finishStroke(context) : null,
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

  String _printedPageStrokeId(String documentId, PrintedNotePage page) {
    return '$documentId::problem-${page.problemId}';
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
      _clearTextInput();
    });
    widget.onPrintedPageChanged(index);
  }

  void jumpToPrintedPage(int pageNumber) {
    final document = context.read<NoteLibraryState>().documentById(
      widget.documentId,
    );
    final pageCount = document?.printedPages.length ?? 0;
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
      setState(() => _draftPoints = [..._draftPoints, point]);
    }
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
          points: _draftPoints,
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

    for (var index = 0; index < stroke.points.length - 1; index += 1) {
      canvas.drawLine(stroke.points[index], stroke.points[index + 1], paint);
    }
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
    for (var index = 0; index < stroke.points.length - 1; index += 1) {
      canvas.drawLine(stroke.points[index], stroke.points[index + 1], paint);
    }
  }

  @override
  bool shouldRepaint(covariant _StrokeOverlayPainter oldDelegate) =>
      oldDelegate.stroke != stroke;
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

void _showPageOverview(BuildContext context, String documentId) {
  showDialog<void>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.28),
    builder: (context) => _PageOverviewDialog(documentId: documentId),
  );
}

class _PageOverviewDialog extends StatefulWidget {
  const _PageOverviewDialog({required this.documentId});

  final String documentId;

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
                  ? _ThumbnailOverview(documentId: widget.documentId)
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
  const _ThumbnailOverview({required this.documentId});

  final String documentId;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<NoteLibraryState>();
    final strokes = state.strokesFor(documentId);

    return LayoutBuilder(
      builder: (context, constraints) {
        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(34, 28, 34, 32),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minWidth: math.max(constraints.maxWidth - 68, 0),
            ),
            child: Align(
              alignment: Alignment.topLeft,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _PageThumbnailCard(
                    pageNumber: 1,
                    strokes: strokes,
                    selected: true,
                  ),
                  const SizedBox(width: 48),
                  const _AddPageTile(),
                ],
              ),
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
  });

  final int pageNumber;
  final List<NoteStroke> strokes;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 150,
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
              child: _ThumbnailPagePreview(strokes: strokes),
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
    );
  }
}

class _ThumbnailPagePreview extends StatelessWidget {
  const _ThumbnailPagePreview({required this.strokes});

  final List<NoteStroke> strokes;

  @override
  Widget build(BuildContext context) {
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

void _showEditorMoreMenu(BuildContext context, String documentId) async {
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
      context.read<NoteLibraryState>().clearPage(documentId);
    case 'export':
      _showSnack(context, 'PDF 내보내기 준비 상태입니다.');
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
