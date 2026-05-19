import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:table_calendar/table_calendar.dart';

import '../app/theme.dart';
import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/list_item_card.dart';
import '../widgets/premium_card.dart';

class CalendarScreen extends StatelessWidget {
  const CalendarScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final calendar = context.watch<StudentAppState>().calendar;
    final events = calendar?.events ?? const [];
    return AppScaffold(
      title: '학생 캘린더',
      subtitle: '개인 일정은 학생에게만 보이고, 학원 일정과 과제/테스트 마감은 연결된 컨텍스트에서 병합됩니다.',
      children: [
        PremiumCard(
          padding: const EdgeInsets.all(8),
          child: TableCalendar(
            firstDay: DateTime.now().subtract(const Duration(days: 365)),
            lastDay: DateTime.now().add(const Duration(days: 365)),
            focusedDay: DateTime.now(),
            calendarFormat: CalendarFormat.month,
            headerStyle: const HeaderStyle(formatButtonVisible: false, titleCentered: true),
            calendarStyle: CalendarStyle(
              defaultTextStyle: const TextStyle(color: AppColors.text),
              weekendTextStyle: const TextStyle(color: AppColors.muted),
              outsideTextStyle: TextStyle(color: AppColors.subtle.withValues(alpha: .6)),
              todayDecoration: BoxDecoration(color: AppColors.violet.withValues(alpha: .35), shape: BoxShape.circle),
              selectedDecoration: const BoxDecoration(color: AppColors.violet, shape: BoxShape.circle),
            ),
          ),
        ),
        PremiumCard(
          title: '다가오는 일정',
          child: Column(
            children: [
              for (final event in events) ...[
                ListItemCard(title: event.title, subtitle: '${event.startsAt.toLocal()} · ${event.visibility}', badge: event.eventType),
                if (event != events.last) const SizedBox(height: 10),
              ],
              if (events.isEmpty) const Text('표시할 일정이 없습니다.', style: TextStyle(color: AppColors.muted)),
            ],
          ),
        ),
      ],
    );
  }
}

