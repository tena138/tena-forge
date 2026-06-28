import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../models/note_models.dart';
import '../state/note_library_state.dart';
import '../state/student_app_state.dart';

class NotesDocumentsScreen extends StatelessWidget {
  const NotesDocumentsScreen({super.key});

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
    final currentFolder = state.currentFolder;

    return Material(
      color: AppColors.bg,
      child: SafeArea(
        bottom: false,
        child: CustomScrollView(
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(22, 24, 22, 0),
              sliver: SliverToBoxAdapter(
                child: _LibraryHeader(title: currentFolder?.name ?? 'Note'),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(22, 18, 22, 0),
              sliver: SliverToBoxAdapter(
                child: _SortAndLayoutBar(state: state),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(22, 34, 22, 42),
              sliver: state.listLayout
                  ? _NoteListSliver(items: items)
                  : _NoteGridSliver(items: items, showNewTile: true),
            ),
          ],
        ),
      ),
    );
  }
}

class _LibraryHeader extends StatelessWidget {
  const _LibraryHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<NoteLibraryState>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            if (state.currentFolderId != null) ...[
              IconButton(
                tooltip: '뒤로',
                onPressed: state.leaveFolder,
                icon: const Icon(Icons.arrow_back_rounded),
              ),
              const SizedBox(width: 4),
            ],
            Expanded(
              child: Text(
                title,
                style: Theme.of(context).textTheme.displaySmall?.copyWith(
                  color: AppColors.text,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0,
                ),
              ),
            ),
            _LibraryActionIcon(
              icon: Icons.sync_rounded,
              badge: '${state.syncCount}',
              tooltip: '동기화 상태',
              onPressed: () =>
                  _showSnack(context, '동기화 대기 ${state.syncCount}개'),
            ),
            _LibraryActionIcon(
              icon: Icons.folder_copy_outlined,
              badge: '${state.inboxCount}',
              tooltip: '받은 문서함',
              onPressed: () =>
                  _showSnack(context, '받은 문서 ${state.inboxCount}개'),
            ),
            _LibraryActionIcon(
              icon: Icons.notifications_none_rounded,
              tooltip: '알림',
              onPressed: () => _showNotifications(context),
            ),
            _LibraryActionIcon(
              icon: state.selectionMode
                  ? Icons.check_circle_rounded
                  : Icons.check_circle_outline_rounded,
              tooltip: '선택 모드',
              onPressed: state.toggleSelectionMode,
            ),
          ],
        ),
        const SizedBox(height: 14),
        const Divider(height: 1, color: AppColors.border),
      ],
    );
  }
}

class _SortAndLayoutBar extends StatelessWidget {
  const _SortAndLayoutBar({required this.state});

  final NoteLibraryState state;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Spacer(),
        SegmentedButton<NoteSortMode>(
          selected: {state.sortMode},
          showSelectedIcon: false,
          onSelectionChanged: (selection) => state.setSortMode(selection.first),
          style: ButtonStyle(
            backgroundColor: WidgetStateProperty.resolveWith(
              (states) => states.contains(WidgetState.selected)
                  ? AppColors.text
                  : AppColors.panelSoft,
            ),
            foregroundColor: WidgetStateProperty.resolveWith(
              (states) => states.contains(WidgetState.selected)
                  ? AppColors.panel
                  : AppColors.text,
            ),
            side: const WidgetStatePropertyAll(
              BorderSide(color: AppColors.border),
            ),
            minimumSize: const WidgetStatePropertyAll(Size(82, 36)),
            textStyle: const WidgetStatePropertyAll(
              TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          segments: const [
            ButtonSegment(value: NoteSortMode.date, label: Text('Date')),
            ButtonSegment(value: NoteSortMode.name, label: Text('Name')),
            ButtonSegment(value: NoteSortMode.type, label: Text('Type')),
          ],
        ),
        const Spacer(),
        IconButton(
          tooltip: state.listLayout ? '그리드 보기' : '리스트 보기',
          onPressed: state.toggleLayout,
          icon: Icon(
            state.listLayout
                ? Icons.grid_view_rounded
                : Icons.view_list_rounded,
            color: AppColors.text,
          ),
        ),
      ],
    );
  }
}

class _NoteGridSliver extends StatelessWidget {
  const _NoteGridSliver({required this.items, required this.showNewTile});

  final List<NoteLibraryItem> items;
  final bool showNewTile;

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
        final totalCount = items.length + (showNewTile ? 1 : 0);
        return SliverGrid(
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            mainAxisSpacing: 28,
            crossAxisSpacing: 28,
            childAspectRatio: 0.86,
          ),
          delegate: SliverChildBuilderDelegate((context, index) {
            if (showNewTile && index == 0) {
              return const _NewDocumentTile();
            }
            final item = items[index - (showNewTile ? 1 : 0)];
            return _FolderTile(item: item);
          }, childCount: totalCount),
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
      itemCount: items.length + 1,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        if (index == 0) return const _NewListItem();
        final item = items[index - 1];
        return _FolderListItem(item: item);
      },
    );
  }
}

class _NewDocumentTile extends StatelessWidget {
  const _NewDocumentTile();

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => _showNewMenu(context),
      child: Column(
        children: [
          Expanded(
            child: CustomPaint(
              painter: _DashedBorderPainter(color: AppColors.text),
              child: const Center(
                child: Icon(Icons.add_rounded, color: AppColors.text, size: 36),
              ),
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'New...',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: AppColors.text,
              fontWeight: FontWeight.w700,
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}

class _NewListItem extends StatelessWidget {
  const _NewListItem();

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: () => _showNewMenu(context),
      tileColor: AppColors.panel,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      leading: const Icon(Icons.add_rounded, color: AppColors.text),
      title: const Text('New...', style: TextStyle(color: AppColors.text)),
    );
  }
}

class _FolderTile extends StatelessWidget {
  const _FolderTile({required this.item});

  final NoteLibraryItem item;

  @override
  Widget build(BuildContext context) {
    final state = context.read<NoteLibraryState>();
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () {
        if (item.type == NoteItemType.folder) {
          state.enterFolder(item.id);
          return;
        }
        final document = state.openDocumentForItem(item.id);
        context.push('/notes/editor/${document.id}');
      },
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
                  item.name,
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
    return ListTile(
      onTap: () {
        if (item.type == NoteItemType.folder) {
          state.enterFolder(item.id);
          return;
        }
        final document = state.openDocumentForItem(item.id);
        context.push('/notes/editor/${document.id}');
      },
      tileColor: AppColors.panel,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      leading: SizedBox(
        width: 52,
        height: 38,
        child: _LibraryItemGraphic(item: item),
      ),
      title: Text(
        item.name,
        style: const TextStyle(
          color: AppColors.text,
          fontWeight: FontWeight.w800,
        ),
      ),
      subtitle: Text(
        '${item.typeLabel} · ${_formatItemDate(item.updatedAt)}',
        style: const TextStyle(color: AppColors.muted),
      ),
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
    return CustomPaint(painter: _FolderPainter(color: color));
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

class _LibraryActionIcon extends StatelessWidget {
  const _LibraryActionIcon({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.badge,
  });

  final IconData icon;
  final String tooltip;
  final String? badge;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          tooltip: tooltip,
          onPressed: onPressed,
          icon: Icon(icon, color: AppColors.text, size: 25),
        ),
        if (badge != null)
          Positioned(
            right: 3,
            top: 3,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: AppColors.text,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                badge!,
                style: const TextStyle(
                  color: AppColors.panel,
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _FolderPainter extends CustomPainter {
  const _FolderPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final tabPaint = Paint()..color = color.withValues(alpha: 0.92);
    final bodyPaint = Paint()..color = color;
    final shadowPaint = Paint()..color = Colors.black.withValues(alpha: 0.06);
    final tabHeight = size.height * 0.28;
    final bodyTop = size.height * 0.20;
    final radius = Radius.circular(size.shortestSide * 0.08);

    final shadowRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(1, bodyTop + 3, size.width - 2, size.height - bodyTop - 3),
      radius,
    );
    canvas.drawRRect(shadowRect, shadowPaint);

    final tabPath = Path()
      ..moveTo(size.width * 0.03, tabHeight)
      ..quadraticBezierTo(size.width * 0.03, 0, size.width * 0.13, 0)
      ..lineTo(size.width * 0.26, 0)
      ..quadraticBezierTo(size.width * 0.34, 0, size.width * 0.40, tabHeight)
      ..lineTo(size.width * 0.95, tabHeight)
      ..quadraticBezierTo(
        size.width,
        tabHeight,
        size.width,
        tabHeight + size.height * 0.05,
      )
      ..lineTo(size.width, bodyTop + 4)
      ..lineTo(size.width * 0.03, bodyTop + 4)
      ..close();
    canvas.drawPath(tabPath, tabPaint);

    final bodyRect = RRect.fromRectAndCorners(
      Rect.fromLTWH(0, bodyTop, size.width, size.height - bodyTop),
      topLeft: radius,
      topRight: radius,
      bottomLeft: radius,
      bottomRight: radius,
    );
    canvas.drawRRect(bodyRect, bodyPaint);

    final highlightPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.34)
      ..strokeWidth = 2;
    canvas.drawLine(
      Offset(size.width * 0.04, bodyTop + 8),
      Offset(size.width * 0.96, bodyTop + 8),
      highlightPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _FolderPainter oldDelegate) =>
      oldDelegate.color != color;
}

class _DashedBorderPainter extends CustomPainter {
  const _DashedBorderPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    const dash = 5.0;
    const gap = 5.0;
    final rect = RRect.fromRectAndRadius(
      Offset.zero & size,
      const Radius.circular(8),
    );
    final path = Path()..addRRect(rect.deflate(1));
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        final next = distance + dash;
        canvas.drawPath(metric.extractPath(distance, next), paint);
        distance = next + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedBorderPainter oldDelegate) =>
      oldDelegate.color != color;
}

String _formatItemDate(DateTime date) {
  return DateFormat('MMM d, yyyy \'at\' h:mm a').format(date);
}

Future<void> _showNewMenu(BuildContext context) async {
  final state = context.read<NoteLibraryState>();
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.panel,
    showDragHandle: true,
    builder: (context) {
      return SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.create_new_folder_outlined),
              title: const Text('새 폴더'),
              subtitle: const Text('Documents에 폴더를 추가합니다.'),
              onTap: () async {
                Navigator.pop(context);
                final name = await _askName(context, '새 폴더 이름', '새 폴더');
                if (name != null) state.addFolder(name);
              },
            ),
            ListTile(
              leading: const Icon(Icons.note_add_outlined),
              title: const Text('새 노트'),
              subtitle: const Text('빈 페이지 편집기를 엽니다.'),
              onTap: () {
                Navigator.pop(context);
                final document = state.addNotebook();
                context.push('/notes/editor/${document.id}');
              },
            ),
            ListTile(
              leading: const Icon(Icons.upload_file_outlined),
              title: const Text('가져오기'),
              subtitle: const Text('PDF/이미지 가져오기는 연결 준비 상태입니다.'),
              onTap: () {
                Navigator.pop(context);
                _showSnack(context, '가져오기 흐름을 열었습니다.');
              },
            ),
          ],
        ),
      );
    },
  );
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
      if (item.type == NoteItemType.folder) {
        state.enterFolder(item.id);
        return;
      }
      final document = state.openDocumentForItem(item.id);
      if (context.mounted) context.push('/notes/editor/${document.id}');
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

void _showNotifications(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.panel,
    showDragHandle: true,
    builder: (context) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            Text(
              '알림',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            SizedBox(height: 12),
            ListTile(
              leading: Icon(Icons.cloud_done_outlined),
              title: Text('최근 노트가 저장되었습니다.'),
            ),
            ListTile(
              leading: Icon(Icons.group_outlined),
              title: Text('공유 폴더 업데이트가 있습니다.'),
            ),
          ],
        ),
      ),
    ),
  );
}

void _showSnack(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}
