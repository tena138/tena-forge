import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/premium_card.dart';

class AssignmentDetailScreen extends StatefulWidget {
  const AssignmentDetailScreen({required this.id, super.key});

  final String id;

  @override
  State<AssignmentDetailScreen> createState() => _AssignmentDetailScreenState();
}

class _AssignmentDetailScreenState extends State<AssignmentDetailScreen> {
  final answerController = TextEditingController();
  bool loading = false;

  @override
  void dispose() {
    answerController.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    final state = context.read<StudentAppState>();
    final assignment = state.assignments.where((item) => item.id == widget.id).firstOrNull;
    if (assignment == null) return;
    setState(() => loading = true);
    try {
      if (assignment.isTest) {
        await state.startTest(assignment.id);
        if (mounted) context.push('/test/${assignment.id}');
      } else {
        await state.submitAssignment(assignment.id, answerController.text.trim().isEmpty ? 'completed' : answerController.text.trim());
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('과제를 제출했습니다.')));
      }
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('제출 가능 시간이나 학원 멤버십을 확인하세요.')));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final assignment = context.watch<StudentAppState>().assignments.where((item) => item.id == widget.id).firstOrNull;
    if (assignment == null) {
      return const AppScaffold(title: '과제 상세', children: [PremiumCard(child: Text('과제를 찾을 수 없습니다.'))]);
    }
    return AppScaffold(
      title: assignment.title,
      subtitle: assignment.description,
      children: [
        PremiumCard(
          title: assignment.isTest ? 'Timed Test' : '제출 정보',
          eyebrow: assignment.assignmentType,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('제출 방식: ${assignment.submissionMode}', style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Text('마감: ${assignment.dueAt?.toLocal().toString() ?? '없음'}', style: const TextStyle(color: AppColors.muted)),
              if (assignment.timeLimitMinutes != null) ...[
                const SizedBox(height: 8),
                Text('제한 시간: ${assignment.timeLimitMinutes}분', style: const TextStyle(color: AppColors.muted)),
              ],
            ],
          ),
        ),
        if (!assignment.isTest)
          PremiumCard(
            title: '답안 / 제출 메모',
            child: TextField(
              controller: answerController,
              minLines: 5,
              maxLines: 8,
              decoration: const InputDecoration(hintText: '답안, 풀이 메모, 또는 완료 표시'),
            ),
          ),
        FilledButton(onPressed: loading ? null : submit, child: Text(assignment.isTest ? '테스트 시작' : '제출하기')),
      ],
    );
  }
}

