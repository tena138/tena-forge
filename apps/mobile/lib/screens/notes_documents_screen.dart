import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../core/text_encoding.dart';
import '../models/note_models.dart';
import '../state/note_library_state.dart';
import '../state/student_app_state.dart';

class NotesDocumentsScreen extends StatefulWidget {
  const NotesDocumentsScreen({super.key});

  @override
  State<NotesDocumentsScreen> createState() => _NotesDocumentsScreenState();
}

class _NotesDocumentsScreenState extends State<NotesDocumentsScreen> {
  bool _quickActionsOpen = false;

  void _toggleQuickActions() {
    setState(() => _quickActionsOpen = !_quickActionsOpen);
  }

  void _closeQuickActions() {
    if (_quickActionsOpen) {
      setState(() => _quickActionsOpen = false);
    }
  }

  void _createNotebook() {
    _closeQuickActions();
    final document = context.read<NoteLibraryState>().addNotebook();
    context.push('/notes/editor/${document.id}');
  }

  Future<void> _createFolder() async {
    _closeQuickActions();
    final name = await _askName(context, '새 폴더 이름', '새 폴더');
    if (!mounted || name == null) return;
    final trimmed = name.trim();
    if (trimmed.isEmpty) return;
    context.read<NoteLibraryState>().addFolder(trimmed);
  }

  void _openAcademyKey() {
    _closeQuickActions();
    context.push('/academies');
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<NoteLibraryState>();
    final appState = context.watch<StudentAppState>();
    final noteState = context.read<NoteLibraryState>();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      noteState.syncAcademyMaterials(
        academies: appState.academies,
        materials: appState.materials,
      );
    });
    final items = state.sortedItems;

    return Scaffold(
      backgroundColor: AppColors.bg,
      floatingActionButton: _NoteQuickActions(
        open: _quickActionsOpen,
        onToggle: _toggleQuickActions,
        onCreateNotebook: _createNotebook,
        onCreateFolder: _createFolder,
        onAddAcademyKey: _openAcademyKey,
      ),
      body: SafeArea(
        bottom: false,
        child: CustomScrollView(
          slivers: [
            if (state.currentFolderId != null)
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(22, 18, 22, 0),
                sliver: SliverToBoxAdapter(
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: _FolderBackButton(onPressed: state.leaveFolder),
                  ),
                ),
              ),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(
                22,
                state.currentFolderId == null ? 34 : 24,
                22,
                140,
              ),
              sliver: state.listLayout
                  ? _NoteListSliver(items: items)
                  : _NoteGridSliver(items: items),
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> _openLibraryItem(
  BuildContext context,
  NoteLibraryItem item,
) async {
  final noteState = context.read<NoteLibraryState>();
  if (item.type == NoteItemType.folder) {
    noteState.enterFolder(item.id);
    return;
  }
  if (item.assignmentType == 'test' && item.assignmentId != null) {
    final appState = context.read<StudentAppState>();
    try {
      await appState.startTest(item.assignmentId!);
      if (context.mounted) context.push('/test/${item.assignmentId}');
    } catch (_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('시험을 시작할 수 없습니다. 기한 또는 세션 상태를 확인해주세요.')),
      );
    }
    return;
  }
  final document = noteState.openDocumentForItem(item.id);
  if (context.mounted) context.push('/notes/editor/${document.id}');
}

class _FolderBackButton extends StatelessWidget {
  const _FolderBackButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: '뒤로가기',
      child: Material(
        color: AppColors.panel,
        shape: const CircleBorder(),
        elevation: 1,
        shadowColor: Colors.black.withValues(alpha: 0.08),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onPressed,
          child: const SizedBox(
            width: 42,
            height: 42,
            child: Icon(
              Icons.arrow_back_ios_new_rounded,
              size: 18,
              color: AppColors.text,
            ),
          ),
        ),
      ),
    );
  }
}

class _NoteQuickActions extends StatelessWidget {
  const _NoteQuickActions({
    required this.open,
    required this.onToggle,
    required this.onCreateNotebook,
    required this.onCreateFolder,
    required this.onAddAcademyKey,
  });

  final bool open;
  final VoidCallback onToggle;
  final VoidCallback onCreateNotebook;
  final VoidCallback onCreateFolder;
  final VoidCallback onAddAcademyKey;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 64,
      height: open ? 244 : 64,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.bottomRight,
        children: [
          _QuickActionButton(
            visible: open,
            bottom: 180,
            heroTag: 'note-action-new-note',
            icon: Icons.note_add_outlined,
            tooltip: '새 노트',
            onPressed: onCreateNotebook,
          ),
          _QuickActionButton(
            visible: open,
            bottom: 120,
            heroTag: 'note-action-new-folder',
            icon: Icons.create_new_folder_outlined,
            tooltip: '새 폴더',
            onPressed: onCreateFolder,
          ),
          _QuickActionButton(
            visible: open,
            bottom: 60,
            heroTag: 'note-action-academy-key',
            icon: Icons.key_rounded,
            tooltip: '학원 키 추가',
            onPressed: onAddAcademyKey,
          ),
          FloatingActionButton(
            heroTag: 'note-action-main',
            tooltip: open ? '닫기' : '추가',
            backgroundColor: AppColors.text,
            foregroundColor: AppColors.panel,
            shape: const CircleBorder(),
            onPressed: onToggle,
            child: AnimatedRotation(
              duration: const Duration(milliseconds: 180),
              turns: open ? 0.125 : 0,
              child: Icon(open ? Icons.close_rounded : Icons.add_rounded),
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickActionButton extends StatelessWidget {
  const _QuickActionButton({
    required this.visible,
    required this.bottom,
    required this.heroTag,
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });

  final bool visible;
  final double bottom;
  final String heroTag;
  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      right: 4,
      bottom: bottom,
      child: IgnorePointer(
        ignoring: !visible,
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 160),
          opacity: visible ? 1 : 0,
          child: AnimatedScale(
            duration: const Duration(milliseconds: 160),
            curve: Curves.easeOutCubic,
            scale: visible ? 1 : 0.72,
            child: FloatingActionButton.small(
              heroTag: heroTag,
              tooltip: tooltip,
              backgroundColor: AppColors.panel,
              foregroundColor: AppColors.text,
              elevation: 4,
              shape: const CircleBorder(),
              onPressed: onPressed,
              child: Icon(icon),
            ),
          ),
        ),
      ),
    );
  }
}

class _NoteGridSliver extends StatelessWidget {
  const _NoteGridSliver({required this.items});

  final List<NoteLibraryItem> items;

  @override
  Widget build(BuildContext context) {
    return SliverLayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.crossAxisExtent;
        final columns = width >= 1200
            ? 7
            : width >= 900
            ? 5
            : width >= 620
            ? 3
            : 2;
        return SliverGrid(
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            mainAxisSpacing: 28,
            crossAxisSpacing: 28,
            childAspectRatio: 0.86,
          ),
          delegate: SliverChildBuilderDelegate((context, index) {
            final item = items[index];
            return _FolderTile(item: item);
          }, childCount: items.length),
        );
      },
    );
  }
}

class _NoteListSliver extends StatelessWidget {
  const _NoteListSliver({required this.items});

  final List<NoteLibraryItem> items;

  @override
  Widget build(BuildContext context) {
    return SliverList.separated(
      itemCount: items.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final item = items[index];
        return _FolderListItem(item: item);
      },
    );
  }
}

class _FolderTile extends StatelessWidget {
  const _FolderTile({required this.item});

  final NoteLibraryItem item;

  @override
  Widget build(BuildContext context) {
    final state = context.read<NoteLibraryState>();
    final assignmentLabel = _assignmentTypeLabel(item);
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => _openLibraryItem(context, item),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: Stack(
              children: [
                Positioned.fill(child: _LibraryItemGraphic(item: item)),
                Positioned(
                  right: 8,
                  top: 24,
                  child: IconButton(
                    tooltip: item.favorite ? '즐겨찾기 해제' : '즐겨찾기',
                    onPressed: () => state.toggleFavorite(item.id),
                    icon: Icon(
                      item.favorite ? Icons.star_rounded : Icons.star_outline,
                      color: item.favorite ? AppColors.text : AppColors.subtle,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Flexible(
                child: Text(
                  repairKoreanText(item.name),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: AppColors.text,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => _showItemMenu(context, item),
                child: const Icon(
                  Icons.keyboard_arrow_down_rounded,
                  color: AppColors.text,
                  size: 18,
                ),
              ),
            ],
          ),
          if (assignmentLabel != null) ...[
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.center,
              child: _AssignmentTypeBadge(label: assignmentLabel),
            ),
          ],
          const SizedBox(height: 4),
          Text(
            _formatItemDate(item.updatedAt),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.muted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _FolderListItem extends StatelessWidget {
  const _FolderListItem({required this.item});

  final NoteLibraryItem item;

  @override
  Widget build(BuildContext context) {
    final state = context.read<NoteLibraryState>();
    final assignmentLabel = _assignmentTypeLabel(item);
    final subtitle = assignmentLabel == null
        ? '${item.typeLabel} · ${_formatItemDate(item.updatedAt)}'
        : '$assignmentLabel · ${_formatItemDate(item.updatedAt)}';
    return ListTile(
      onTap: () => _openLibraryItem(context, item),
      tileColor: AppColors.panel,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      leading: SizedBox(
        width: 52,
        height: 38,
        child: _LibraryItemGraphic(item: item),
      ),
      title: Text(
        repairKoreanText(item.name),
        style: const TextStyle(
          color: AppColors.text,
          fontWeight: FontWeight.w800,
        ),
      ),
      subtitle: Text(subtitle, style: const TextStyle(color: AppColors.muted)),
      trailing: Wrap(
        spacing: 2,
        children: [
          IconButton(
            tooltip: item.favorite ? '즐겨찾기 해제' : '즐겨찾기',
            onPressed: () => state.toggleFavorite(item.id),
            icon: Icon(
              item.favorite ? Icons.star_rounded : Icons.star_outline,
              color: item.favorite ? AppColors.text : AppColors.subtle,
            ),
          ),
          IconButton(
            tooltip: '더보기',
            onPressed: () => _showItemMenu(context, item),
            icon: const Icon(Icons.more_horiz_rounded),
          ),
        ],
      ),
    );
  }
}

class _LibraryItemGraphic extends StatelessWidget {
  const _LibraryItemGraphic({required this.item});

  final NoteLibraryItem item;

  @override
  Widget build(BuildContext context) {
    if (item.type == NoteItemType.folder) {
      return _FolderGraphic(color: item.color);
    }
    return const _NotebookGraphic();
  }
}

class _FolderGraphic extends StatelessWidget {
  const _FolderGraphic({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : 160.0;
        final height = constraints.maxHeight.isFinite
            ? constraints.maxHeight
            : 112.0;
        final bodyTop = height * 0.26;
        final bodyRadius = BorderRadius.circular(width * 0.045);
        final baseColor = Color.lerp(color, Colors.white, 0.22) ?? color;
        final tabColor = Color.lerp(color, Colors.white, 0.08) ?? color;

        return Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned(
              left: width * 0.07,
              right: width * 0.07,
              top: bodyTop + height * 0.08,
              bottom: height * 0.02,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.08),
                  borderRadius: bodyRadius,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.08),
                      blurRadius: 20,
                      offset: const Offset(0, 12),
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              left: width * 0.05,
              top: height * 0.08,
              width: width * 0.36,
              height: height * 0.28,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: tabColor,
                  border: Border.all(
                    color: Colors.black.withValues(alpha: 0.05),
                  ),
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(width * 0.05),
                    topRight: Radius.circular(width * 0.08),
                  ),
                ),
              ),
            ),
            Positioned(
              left: width * 0.02,
              right: width * 0.02,
              top: bodyTop,
              bottom: height * 0.02,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: baseColor,
                  border: Border.all(
                    color: Colors.black.withValues(alpha: 0.05),
                  ),
                  borderRadius: bodyRadius,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.05),
                      blurRadius: 14,
                      offset: const Offset(0, 7),
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              left: width * 0.08,
              right: width * 0.08,
              top: bodyTop + height * 0.08,
              child: Container(
                height: 2,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.72),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            Positioned(
              left: width * 0.08,
              right: width * 0.12,
              bottom: height * 0.13,
              child: Container(
                height: height * 0.13,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.28),
                  borderRadius: BorderRadius.circular(width * 0.025),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _NotebookGraphic extends StatelessWidget {
  const _NotebookGraphic();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.panel,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(8),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A000000),
            blurRadius: 14,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 18, 14, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(height: 8, color: AppColors.panelSoft),
            const SizedBox(height: 10),
            Container(height: 8, color: AppColors.panelSoft),
            const SizedBox(height: 10),
            Container(height: 8, color: AppColors.panelSoft),
            const Spacer(),
            Align(
              alignment: Alignment.bottomRight,
              child: Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  color: AppColors.panelSoft,
                  borderRadius: BorderRadius.circular(6),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AssignmentTypeBadge extends StatelessWidget {
  const _AssignmentTypeBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.text,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          color: AppColors.panel,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

String _formatItemDate(DateTime date) {
  if (date.year < 2001) return 'No date';
  return DateFormat('MMM d, yyyy \'at\' h:mm a').format(date.toLocal());
}

String? _assignmentTypeLabel(NoteLibraryItem item) {
  if (item.type == NoteItemType.folder) return null;
  switch ((item.assignmentType ?? '').trim().toLowerCase()) {
    case 'textbook':
    case 'book':
    case 'material':
      return '교재';
    case 'homework':
    case 'assignment':
      return '과제';
    case 'test':
    case 'exam':
      return '시험';
    default:
      return null;
  }
}

Future<void> _showItemMenu(BuildContext context, NoteLibraryItem item) async {
  final state = context.read<NoteLibraryState>();
  final selected = await showMenu<String>(
    context: context,
    position: const RelativeRect.fromLTRB(200, 240, 24, 0),
    items: [
      const PopupMenuItem(value: 'rename', child: Text('이름 변경')),
      PopupMenuItem(
        value: 'favorite',
        child: Text(item.favorite ? '즐겨찾기 해제' : '즐겨찾기'),
      ),
      const PopupMenuItem(value: 'share', child: Text('공유')),
      const PopupMenuItem(value: 'open', child: Text('노트 열기')),
    ],
  );
  if (!context.mounted || selected == null) return;
  switch (selected) {
    case 'rename':
      final name = await _askName(context, '이름 변경', item.name);
      if (name != null) state.renameItem(item.id, name);
    case 'favorite':
      state.toggleFavorite(item.id);
    case 'share':
      _showSnack(context, '${item.name} 공유 설정을 열었습니다.');
    case 'open':
      await _openLibraryItem(context, item);
  }
}

Future<String?> _askName(
  BuildContext context,
  String title,
  String initialValue,
) {
  return showDialog<String>(
    context: context,
    builder: (context) => _NameDialog(title: title, initialValue: initialValue),
  );
}

class _NameDialog extends StatefulWidget {
  const _NameDialog({required this.title, required this.initialValue});

  final String title;
  final String initialValue;

  @override
  State<_NameDialog> createState() => _NameDialogState();
}

class _NameDialogState extends State<_NameDialog> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialValue);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _close([String? value]) {
    FocusManager.instance.primaryFocus?.unfocus();
    Navigator.of(context).pop(value);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        controller: _controller,
        autofocus: true,
        textInputAction: TextInputAction.done,
        onSubmitted: _close,
      ),
      actionsPadding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
      actions: [
        SizedBox(
          width: double.infinity,
          child: Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 52,
                  child: OutlinedButton(
                    onPressed: _close,
                    child: const Text('취소'),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: SizedBox(
                  height: 52,
                  child: FilledButton(
                    onPressed: () => _close(_controller.text),
                    child: const Text('저장'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

void _showSnack(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}
