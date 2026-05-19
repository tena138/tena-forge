import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/empty_state.dart';
import '../widgets/list_item_card.dart';
import '../widgets/premium_card.dart';

class MaterialsScreen extends StatelessWidget {
  const MaterialsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final materials = context.watch<StudentAppState>().materials;
    return AppScaffold(
      title: '학원 자료',
      subtitle: '자료는 연결된 학원 컨텍스트에서만 보이며, 다운로드/출력은 서버 워터마크 API를 통해 처리합니다.',
      children: [
        const PremiumCard(
          title: 'Distribution Protection',
          child: Text(
            '학생에게 원본 영구 URL을 노출하지 않습니다. 다운로드가 허용된 자료도 학생명, 학원명, export ID, timestamp가 들어간 워터마크 사본을 받아야 합니다.',
            style: TextStyle(color: AppColors.muted, height: 1.5),
          ),
        ),
        for (final material in materials)
          ListItemCard(
            title: material.title,
            subtitle: '다운로드 ${material.canDownload ? '허용' : '제한'} · 오답 추가 ${material.canAddToWrongAnswer ? '가능' : '제한'}',
            badge: material.materialType,
            trailing: IconButton(
              onPressed: material.canDownload
                  ? () async {
                      try {
                        await context.read<StudentAppState>().repository.requestMaterialDownload(material.id);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('워터마크 다운로드를 요청했습니다.')));
                        }
                      } catch (_) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('다운로드 권한이 없습니다.')));
                        }
                      }
                    }
                  : null,
              icon: const Icon(Icons.download),
            ),
          ),
        if (materials.isEmpty) const EmptyState(title: '자료가 없습니다', body: '학원에서 배포한 자료가 있으면 이곳에 표시됩니다.'),
      ],
    );
  }
}

