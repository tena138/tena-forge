import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/empty_state.dart';
import '../widgets/list_item_card.dart';

class AssignmentsScreen extends StatelessWidget {
  const AssignmentsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final assignments = context.watch<StudentAppState>().assignments;
    return AppScaffold(
      title: '과제 / 테스트',
      subtitle: '학원별 과제, 풀이 제출, 자동채점, timed test를 한 곳에서 관리합니다.',
      children: [
        for (final assignment in assignments)
          ListItemCard(
            title: assignment.title,
            subtitle: assignment.dueAt == null ? assignment.description : '마감 ${assignment.dueAt!.toLocal()}',
            badge: assignment.assignmentType,
            onTap: () => context.push('/assignment/${assignment.id}'),
          ),
        if (assignments.isEmpty) const EmptyState(title: '과제가 없습니다', body: '학원 키를 등록하면 학원별 과제가 여기에 표시됩니다.'),
      ],
    );
  }
}

