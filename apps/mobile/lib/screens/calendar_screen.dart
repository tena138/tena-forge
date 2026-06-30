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
}

class _MonthCalendar extends StatelessWidget {
  const _MonthCalendar({
    required this.focusedMonth,
    required this.selectedDay,
    required this.blocks,
    required this.onPreviousMonth,
    required this.onNextMonth,
    required this.onSelectDay,
  });

  final DateTime focusedMonth;
  final DateTime selectedDay;
  final List<_CalendarBlock> blocks;
  final VoidCallback onPreviousMonth;
  final VoidCallback onNextMonth;
  final ValueChanged<DateTime> onSelectDay;

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
  });

  final DateTime day;
  final bool currentMonth;
  final bool today;
  final bool selected;
  final List<_CalendarBlock> blocks;
  final VoidCallback onTap;

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
                      return _EventBlock(block: blocks[index]);
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
  const _EventBlock({required this.block});

  final _CalendarBlock block;

  @override
  Widget build(BuildContext context) {
    return Container(
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
    required this.title,
    required this.startsAt,
    required this.background,
    required this.border,
    required this.foreground,
    this.endsAt,
    this.allDay = false,
  });

  final String title;
  final DateTime startsAt;
  final DateTime? endsAt;
  final Color background;
  final Color border;
  final Color foreground;
  final bool allDay;

  DateTime get day => startsAt;

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
          title: event.title,
          startsAt: event.startsAt.toLocal(),
          endsAt: event.endsAt?.toLocal(),
          background: isClassSchedule
              ? AppColors.text
              : const Color(0xFF374151),
          border: isClassSchedule ? AppColors.text : const Color(0xFF374151),
          foreground: AppColors.panel,
        ),
      );
    }
    for (final dueDate
        in calendar?.assignmentDueDates ?? const <AssignmentDueDate>[]) {
      final dueAt = dueDate.dueAt;
      if (dueAt == null) continue;
      blocks.add(
        _CalendarBlock(
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
