import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/metric_tile.dart';
import '../widgets/premium_card.dart';

class QuotaScreen extends StatelessWidget {
  const QuotaScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final quota = context.watch<StudentAppState>().quota;
    return AppScaffold(
      title: '사용량 / Quota',
      subtitle: '학생 기본 quota에 연결된 학원의 학생용 benefit이 더해집니다.',
      children: [
        Row(
          children: [
            MetricTile(label: '업로드', value: '${quota?.remaining['upload'] ?? 5}', helper: '남은 횟수'),
            const SizedBox(width: 10),
            MetricTile(label: '추출', value: '${quota?.remaining['extraction'] ?? 5}', helper: '남은 횟수'),
            const SizedBox(width: 10),
            MetricTile(label: '내보내기', value: '${quota?.remaining['export'] ?? 5}', helper: '남은 횟수'),
          ],
        ),
        PremiumCard(
          title: 'Quota 구성',
          eyebrow: 'Base + Academy',
          child: Column(
            children: [
              for (final item in quota?.contributions ?? const []) ...[
                Row(
                  children: [
                    Expanded(child: Text(item.academyName ?? item.source, style: const TextStyle(fontWeight: FontWeight.w900))),
                    Text('+${item.upload} / +${item.extraction} / +${item.export}', style: const TextStyle(color: AppColors.cyan, fontWeight: FontWeight.w900)),
                  ],
                ),
                if (item != quota?.contributions.last) const Divider(color: AppColors.border, height: 22),
              ],
            ],
          ),
        ),
        const PremiumCard(
          title: '서버 강제 정책',
          child: Text(
            '학생 PDF 업로드는 1페이지 단위입니다. 내보내기와 자료 다운로드는 watermark export record와 signed URL을 통해서만 처리해야 합니다.',
            style: TextStyle(color: AppColors.muted, height: 1.5),
          ),
        ),
      ],
    );
  }
}

