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
  bool loading = false;

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
        await state.submitAssignment(assignment.id, 'completed');
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('완료 체크를 선생님에게 보냈습니다.')));
      }
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('완료 체크 가능 시간이나 학원 멤버십을 확인하세요.')));
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
              const SizedBox(height: 8),
              Text(
                '상태: ${assignment.statusLabel}',
                style: TextStyle(
                  color: assignment.isCompleted
                      ? AppColors.success
                      : assignment.isAwaitingTeacherConfirmation
                          ? AppColors.warning
                          : AppColors.muted,
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (assignment.problemCount > 0) ...[
                const SizedBox(height: 8),
                Text('문항: ${assignment.problemCount}개', style: const TextStyle(color: AppColors.muted)),
              ],
              if (assignment.materialScope != null) ...[
                const SizedBox(height: 8),
                Text('분량: ${assignment.materialScope}', style: const TextStyle(color: AppColors.muted)),
              ],
              if (assignment.timeLimitMinutes != null) ...[
                const SizedBox(height: 8),
                Text('제한 시간: ${assignment.timeLimitMinutes}분', style: const TextStyle(color: AppColors.muted)),
              ],
            ],
          ),
        ),
        if (!assignment.isTest)
          PremiumCard(
            title: assignment.isCompleted
                ? '완료됨'
                : assignment.isAwaitingTeacherConfirmation
                    ? '선생 확인 대기'
                    : '완료 체크',
            child: Row(
              children: [
                Icon(
                  assignment.isCompleted
                      ? Icons.check_circle
                      : assignment.isAwaitingTeacherConfirmation
                          ? Icons.pending_actions
                          : Icons.radio_button_unchecked,
                  color: assignment.isCompleted
                      ? AppColors.success
                      : assignment.isAwaitingTeacherConfirmation
                          ? AppColors.warning
                          : AppColors.muted,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    assignment.isCompleted
                        ? '선생님이 최종 확인한 완료 상태입니다.'
                        : assignment.isAwaitingTeacherConfirmation
                            ? '선생님이 최종 확인하면 과제 완료로 반영됩니다.'
                            : '과제를 다 했으면 완료 체크를 눌러 선생님에게 알려주세요.',
                    style: const TextStyle(color: AppColors.muted, height: 1.35),
                  ),
                ),
              ],
            ),
          ),
        FilledButton.icon(
          onPressed: loading || assignment.isCompleted || assignment.isAwaitingTeacherConfirmation ? null : submit,
          icon: Icon(assignment.isTest ? Icons.play_arrow : Icons.check),
          label: Text(
            assignment.isTest
                ? '테스트 시작'
                : assignment.isCompleted
                    ? '완료됨'
                    : assignment.isAwaitingTeacherConfirmation
                        ? '선생 확인 대기'
                        : '완료 체크',
          ),
        ),
      ],
    );
  }
}

