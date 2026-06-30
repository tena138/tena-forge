import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../models/student_models.dart';
import '../state/student_app_state.dart';

class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  late DateTime focusedMonth;
  late DateTime selectedDay;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    focusedMonth = DateTime(now.year, now.month);
    selectedDay = DateTime(now.year, now.month, now.day);
  }

  @override
  Widget build(BuildContext context) {
    final calendar = context.watch<StudentAppState>().calendar;
    final blocks = _CalendarBlock.fromCalendar(calendar);

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 14, 22, 20),
          child: Column(
            children: [
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final calendarHeight = constraints.maxHeight < 760
                        ? 760.0
                        : constraints.maxHeight;
                    return SingleChildScrollView(
                      child: SizedBox(
                        height: calendarHeight,
                        child: _MonthCalendar(
                          focusedMonth: focusedMonth,
                          selectedDay: selectedDay,
                          blocks: blocks,
                          onPreviousMonth: () => setState(() {
                            focusedMonth = DateTime(
                              focusedMonth.year,
                              focusedMonth.month - 1,
                            );
                          }),
                          onNextMonth: () => setState(() {
                            focusedMonth = DateTime(
                              focusedMonth.year,
                              focusedMonth.month + 1,
                            );
                          }),
                          onSelectDay: (day) => setState(() {
                            selectedDay = DateTime(
                              day.year,
                              day.month,
                              day.day,
                            );
                            if (focusedMonth.year != day.year ||
                                focusedMonth.month != day.month) {
                              focusedMonth = DateTime(day.year, day.month);
                            }
                          }),
                          onBlockTap: _showClassPreview,
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showClassPreview(_CalendarBlock block) {
    if (!block.canPreviewClassSchedule) return;
    final previewFuture = context
        .read<StudentAppState>()
        .loadClassSchedulePreview(block.id);
    showDialog<void>(
      context: context,
      builder: (context) => _ClassSchedulePreviewDialog(
        block: block,
        previewFuture: previewFuture,
      ),
    );
  }
}

class _MonthCalendar extends StatelessWidget {
  const _MonthCalendar({
    required this.focusedMonth,
    required this.selectedDay,
    required this.blocks,
    required this.onPreviousMonth,
    required this.onNextMonth,
    required this.onSelectDay,
    required this.onBlockTap,
  });

  final DateTime focusedMonth;
  final DateTime selectedDay;
  final List<_CalendarBlock> blocks;
  final VoidCallback onPreviousMonth;
  final VoidCallback onNextMonth;
  final ValueChanged<DateTime> onSelectDay;
  final ValueChanged<_CalendarBlock> onBlockTap;

  @override
  Widget build(BuildContext context) {
    final firstDay = DateTime(focusedMonth.year, focusedMonth.month);
    final startOffset = firstDay.weekday % DateTime.daysPerWeek;
    final firstVisibleDay = firstDay.subtract(Duration(days: startOffset));
    final today = DateTime.now();
    final monthLabel = DateFormat('MMMM yyyy').format(focusedMonth);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.panel,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(8),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0F000000),
            blurRadius: 18,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        children: [
          SizedBox(
            height: 58,
            child: Row(
              children: [
                IconButton(
                  tooltip: 'Previous month',
                  onPressed: onPreviousMonth,
                  icon: const Icon(Icons.chevron_left_rounded),
                ),
                Expanded(
                  child: Text(
                    monthLabel,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: AppColors.text,
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Next month',
                  onPressed: onNextMonth,
                  icon: const Icon(Icons.chevron_right_rounded),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.border),
          const SizedBox(
            height: 42,
            child: Row(
              children: [
                _WeekdayLabel('Sun'),
                _WeekdayLabel('Mon'),
                _WeekdayLabel('Tue'),
                _WeekdayLabel('Wed'),
                _WeekdayLabel('Thu'),
                _WeekdayLabel('Fri'),
                _WeekdayLabel('Sat'),
              ],
            ),
          ),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final rowHeight = constraints.maxHeight / 6;
                return GridView.builder(
                  padding: EdgeInsets.zero,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: DateTime.daysPerWeek,
                    mainAxisExtent: rowHeight,
                  ),
                  itemCount: 42,
                  itemBuilder: (context, index) {
                    final day = firstVisibleDay.add(Duration(days: index));
                    return _CalendarDayCell(
                      day: day,
                      currentMonth: day.month == focusedMonth.month,
                      today: _sameDate(day, today),
                      selected: _sameDate(day, selectedDay),
                      blocks: _blocksForDay(blocks, day),
                      onTap: () => onSelectDay(day),
                      onBlockTap: onBlockTap,
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _WeekdayLabel extends StatelessWidget {
  const _WeekdayLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Center(
        child: Text(
          label,
          style: const TextStyle(
            color: AppColors.muted,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

class _CalendarDayCell extends StatelessWidget {
  const _CalendarDayCell({
    required this.day,
    required this.currentMonth,
    required this.today,
    required this.selected,
    required this.blocks,
    required this.onTap,
    required this.onBlockTap,
  });

  final DateTime day;
  final bool currentMonth;
  final bool today;
  final bool selected;
  final List<_CalendarBlock> blocks;
  final VoidCallback onTap;
  final ValueChanged<_CalendarBlock> onBlockTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.panelSoft : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border(
              top: const BorderSide(color: AppColors.border),
              right: const BorderSide(color: AppColors.border),
              bottom: selected
                  ? const BorderSide(color: AppColors.text, width: 1.5)
                  : BorderSide.none,
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: today
                        ? const BoxDecoration(
                            color: AppColors.text,
                            shape: BoxShape.circle,
                          )
                        : null,
                    child: Text(
                      '${day.day}',
                      style: TextStyle(
                        color: today
                            ? AppColors.panel
                            : currentMonth
                            ? AppColors.text
                            : AppColors.subtle,
                        fontWeight: today ? FontWeight.w900 : FontWeight.w700,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Expanded(
                  child: ListView.separated(
                    padding: EdgeInsets.zero,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: blocks.length > 3 ? 4 : blocks.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 4),
                    itemBuilder: (context, index) {
                      if (index == 3 && blocks.length > 3) {
                        return _MoreBlock(count: blocks.length - 3);
                      }
                      final block = blocks[index];
                      return _EventBlock(
                        block: block,
                        onTap: block.canPreviewClassSchedule
                            ? () => onBlockTap(block)
                            : null,
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EventBlock extends StatelessWidget {
  const _EventBlock({required this.block, this.onTap});

  final _CalendarBlock block;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final content = Container(
      height: 24,
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: block.background,
        borderRadius: BorderRadius.circular(5),
        border: Border.all(color: block.border),
      ),
      child: Text(
        block.compactLabel,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          color: block.foreground,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
    if (onTap == null) return content;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(5),
        onTap: onTap,
        child: content,
      ),
    );
  }
}

class _ClassSchedulePreviewDialog extends StatelessWidget {
  const _ClassSchedulePreviewDialog({
    required this.block,
    required this.previewFuture,
  });

  final _CalendarBlock block;
  final Future<ClassSchedulePreview> previewFuture;

  @override
  Widget build(BuildContext context) {
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: 520,
          maxHeight: MediaQuery.of(context).size.height * 0.82,
        ),
        child: FutureBuilder<ClassSchedulePreview>(
          future: previewFuture,
          builder: (context, snapshot) {
            final preview = snapshot.data;
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          preview?.event.title ?? block.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.text,
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: '닫기',
                        onPressed: () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                ),
                const Divider(height: 1, color: AppColors.border),
                Expanded(
                  child: switch (snapshot.connectionState) {
                    ConnectionState.waiting || ConnectionState.active =>
                      const Center(child: CircularProgressIndicator()),
                    _ when snapshot.hasError => const _PreviewErrorState(),
                    _ when preview != null => _ClassPreviewBody(
                      preview: preview,
                    ),
                    _ => const _PreviewErrorState(),
                  },
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _PreviewErrorState extends StatelessWidget {
  const _PreviewErrorState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Text(
          '수업 미리보기를 불러오지 못했습니다.',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.muted, fontWeight: FontWeight.w800),
        ),
      ),
    );
  }
}

class _ClassPreviewBody extends StatelessWidget {
  const _ClassPreviewBody({required this.preview});

  final ClassSchedulePreview preview;

  @override
  Widget build(BuildContext context) {
    final event = preview.event;
    final notes = preview.notes.trim();
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _PreviewPill(
              icon: Icons.school_outlined,
              label: event.academyName ?? 'Academy',
            ),
            _PreviewPill(
              icon: Icons.groups_outlined,
              label: event.className ?? 'Class',
            ),
            _PreviewPill(
              icon: Icons.schedule_rounded,
              label: _eventTimeLabel(event.startsAt, event.endsAt),
            ),
          ],
        ),
        if ((event.description ?? '').trim().isNotEmpty) ...[
          const SizedBox(height: 16),
          _PreviewSection(
            title: '수업 설명',
            child: Text(
              event.description!.trim(),
              style: const TextStyle(color: AppColors.text, height: 1.45),
            ),
          ),
        ],
        const SizedBox(height: 16),
        _PreviewSection(
          title: '수업 타임라인',
          child: preview.lessonPlan.isEmpty
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 18),
                  child: Text(
                    '강사가 아직 수업 타임라인을 설정하지 않았습니다.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: AppColors.muted,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                )
              : Column(
                  children: preview.lessonPlan
                      .map(
                        (item) => _LessonPlanRow(
                          item: item,
                          classStartsAt: event.startsAt,
                        ),
                      )
                      .toList(growable: false),
                ),
        ),
        if (notes.isNotEmpty) ...[
          const SizedBox(height: 16),
          _PreviewSection(
            title: '수업 메모',
            child: Text(
              notes,
              style: const TextStyle(color: AppColors.text, height: 1.45),
            ),
          ),
        ],
        if (preview.updatedAt != null) ...[
          const SizedBox(height: 14),
          Text(
            '업데이트 ${DateFormat('yyyy. MM. dd. HH:mm').format(preview.updatedAt!.toLocal())}',
            textAlign: TextAlign.right,
            style: const TextStyle(
              color: AppColors.subtle,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ],
    );
  }
}

class _PreviewPill extends StatelessWidget {
  const _PreviewPill({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.panelSoft,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: AppColors.muted),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.text,
              fontSize: 12,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _PreviewSection extends StatelessWidget {
  const _PreviewSection({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.panel,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              title,
              style: const TextStyle(
                color: AppColors.text,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 10),
            child,
          ],
        ),
      ),
    );
  }
}

class _LessonPlanRow extends StatelessWidget {
  const _LessonPlanRow({required this.item, required this.classStartsAt});

  final ClassScheduleLessonPlanItem item;
  final DateTime classStartsAt;

  @override
  Widget build(BuildContext context) {
    final startsAt = classStartsAt.toLocal().add(
      Duration(minutes: item.startMinute),
    );
    final endsAt = startsAt.add(Duration(minutes: item.durationMinutes));
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.panelSoft,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 92,
            child: Text(
              '${DateFormat('HH:mm').format(startsAt)}-${DateFormat('HH:mm').format(endsAt)}',
              style: const TextStyle(
                color: AppColors.text,
                fontSize: 12,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          const SizedBox(width: 10),
          _KindBadge(kind: item.kind),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              item.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: AppColors.text,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _KindBadge extends StatelessWidget {
  const _KindBadge({required this.kind});

  final String kind;

  @override
  Widget build(BuildContext context) {
    final label = switch (kind) {
      'break' => '휴식',
      'test' => '시험',
      _ => '수업',
    };
    return Container(
      width: 44,
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(vertical: 5),
      decoration: BoxDecoration(
        color: kind == 'test' ? AppColors.text : AppColors.panel,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.border),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: kind == 'test' ? AppColors.panel : AppColors.text,
          fontSize: 11,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _MoreBlock extends StatelessWidget {
  const _MoreBlock({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Text(
      '+$count more',
      style: const TextStyle(
        color: AppColors.muted,
        fontSize: 11,
        fontWeight: FontWeight.w800,
      ),
    );
  }
}

class _CalendarBlock {
  const _CalendarBlock({
    required this.id,
    required this.title,
    required this.startsAt,
    required this.background,
    required this.border,
    required this.foreground,
    this.endsAt,
    this.description,
    this.academyId,
    this.academyName,
    this.classId,
    this.className,
    this.sourceType,
    this.allDay = false,
  });

  final String id;
  final String title;
  final String? description;
  final DateTime startsAt;
  final DateTime? endsAt;
  final Color background;
  final Color border;
  final Color foreground;
  final String? academyId;
  final String? academyName;
  final String? classId;
  final String? className;
  final String? sourceType;
  final bool allDay;

  DateTime get day => startsAt;

  bool get canPreviewClassSchedule =>
      sourceType == 'forge_class_schedule' && id.trim().isNotEmpty;

  String get timeLabel {
    if (allDay) return 'Due';
    final start = DateFormat('HH:mm').format(startsAt);
    final end = endsAt == null ? '' : DateFormat('HH:mm').format(endsAt!);
    return end.isEmpty ? start : '$start-$end';
  }

  String get compactLabel => allDay ? title : '$timeLabel $title';

  static List<_CalendarBlock> fromCalendar(CalendarResponse? calendar) {
    final blocks = <_CalendarBlock>[];
    for (final event in calendar?.events ?? const <CalendarItem>[]) {
      final isClassSchedule =
          event.sourceType == 'forge_class_schedule' ||
          event.eventType == 'class_schedule';
      blocks.add(
        _CalendarBlock(
          id: event.id,
          title: event.title,
          description: event.description,
          startsAt: event.startsAt.toLocal(),
          endsAt: event.endsAt?.toLocal(),
          background: isClassSchedule
              ? AppColors.text
              : const Color(0xFF374151),
          border: isClassSchedule ? AppColors.text : const Color(0xFF374151),
          foreground: AppColors.panel,
          academyId: event.academyId,
          academyName: event.academyName,
          classId: event.classId,
          className: event.className,
          sourceType: event.sourceType,
        ),
      );
    }
    for (final dueDate
        in calendar?.assignmentDueDates ?? const <AssignmentDueDate>[]) {
      final dueAt = dueDate.dueAt;
      if (dueAt == null) continue;
      blocks.add(
        _CalendarBlock(
          id: dueDate.id,
          title: dueDate.title,
          startsAt: dueAt.toLocal(),
          background: AppColors.panelSoft,
          border: AppColors.border,
          foreground: AppColors.text,
          allDay: true,
        ),
      );
    }
    return blocks;
  }
}

List<_CalendarBlock> _blocksForDay(List<_CalendarBlock> blocks, DateTime day) {
  return blocks.where((block) => _sameDate(block.day, day)).toList()
    ..sort((a, b) {
      final time = a.startsAt.compareTo(b.startsAt);
      if (time != 0) return time;
      return a.title.compareTo(b.title);
    });
}

bool _sameDate(DateTime a, DateTime b) {
  return a.year == b.year && a.month == b.month && a.day == b.day;
}

String _eventTimeLabel(DateTime startsAt, DateTime? endsAt) {
  final start = DateFormat('HH:mm').format(startsAt.toLocal());
  if (endsAt == null) return start;
  return '$start-${DateFormat('HH:mm').format(endsAt.toLocal())}';
}
