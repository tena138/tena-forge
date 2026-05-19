import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/empty_state.dart';
import '../widgets/list_item_card.dart';
import '../widgets/premium_card.dart';

class WrongAnswersScreen extends StatelessWidget {
  const WrongAnswersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<StudentAppState>();
    final items = state.wrongAnswers;
    return AppScaffold(
      title: '오답노트',
      subtitle: '개인 오답은 기본적으로 비공개이고, 학원 자료 기반 오답은 권한 정책에 따라 연결됩니다.',
      children: [
        PremiumCard(
          title: '복습 큐',
          child: Column(
            children: [
              for (final item in items) ...[
                ListItemCard(
                  title: item.problemText ?? '오답 항목',
                  subtitle: '${item.visibility} · ${item.subject ?? '과목 없음'} / ${item.unit ?? '단원 없음'}',
                  badge: item.sourceType,
                ),
                if (item != items.last) const SizedBox(height: 10),
              ],
              if (items.isEmpty) const EmptyState(title: '오답 항목이 없습니다', body: '사진, 1페이지 PDF, 학원 과제/자료에서 오답을 추가할 수 있습니다.'),
            ],
          ),
        ),
        FilledButton.icon(onPressed: () => context.push('/add-wrong-answer'), icon: const Icon(Icons.camera_alt), label: const Text('사진으로 추가')),
        OutlinedButton.icon(onPressed: () => context.push('/add-pdf'), icon: const Icon(Icons.picture_as_pdf), label: const Text('1페이지 PDF 추가')),
        OutlinedButton.icon(
          onPressed: items.isEmpty
              ? null
              : () async {
                  await context.read<StudentAppState>().exportWrongAnswerSheet(items.take(5).map((item) => item.id).toList());
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('워터마크 학습지 내보내기 기록을 만들었습니다.')));
                  }
                },
          icon: const Icon(Icons.download),
          label: const Text('워터마크 학습지 내보내기'),
        ),
        const Text(
          '원본 전체 페이지를 복원하는 방식이 아니라 학습지 카드 형태로 재구성하고, 모든 출력에는 학생별 forensic watermark를 전제로 합니다.',
          style: TextStyle(color: AppColors.muted, height: 1.5),
        ),
      ],
    );
  }
}

