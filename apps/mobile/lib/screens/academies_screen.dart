import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/empty_state.dart';
import '../widgets/list_item_card.dart';
import '../widgets/premium_card.dart';

class AcademiesScreen extends StatelessWidget {
  const AcademiesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<StudentAppState>();
    return AppScaffold(
      title: '연결된 학원',
      subtitle: 'Personal 컨텍스트와 연결된 학원 컨텍스트를 전환합니다.',
      actions: [
        IconButton(
          tooltip: '메인으로',
          onPressed: () => context.go('/calendar'),
          icon: const Icon(Icons.calendar_month_outlined),
        ),
      ],
      children: [
        if (state.academyInvites.isNotEmpty)
          PremiumCard(
            title: '받은 초대',
            child: Column(
              children: [
                for (final invite in state.academyInvites) ...[
                  ListItemCard(
                    title: invite.academyName,
                    subtitle: [
                      invite.className,
                      invite.studentName,
                    ].whereType<String>().where((value) => value.isNotEmpty).join(' · '),
                    badge: 'pending',
                    trailing: Wrap(
                      spacing: 6,
                      children: [
                        FilledButton(
                          onPressed: () {
                            state.acceptAcademyInvite(invite);
                          },
                          child: const Text('수락'),
                        ),
                        OutlinedButton(
                          onPressed: () {
                            state.declineAcademyInvite(invite);
                          },
                          child: const Text('거절'),
                        ),
                      ],
                    ),
                  ),
                  if (invite != state.academyInvites.last)
                    const SizedBox(height: 10),
                ],
              ],
            ),
          ),
        if (state.academyInvites.isNotEmpty) const SizedBox(height: 14),
        PremiumCard(
          title: 'Contexts',
          child: Column(
            children: [
              const ListItemCard(
                title: 'Personal',
                subtitle: '개인 캘린더와 개인 오답노트. 학원에는 공개되지 않습니다.',
                badge: 'private',
              ),
              for (final academy in state.academies) ...[
                const SizedBox(height: 10),
                ListItemCard(
                  title: academy.academyName ?? academy.academyId,
                  subtitle:
                      '좌석 ${academy.academySeatId.substring(0, academy.academySeatId.length.clamp(0, 8))} · ${academy.status}',
                  badge: 'academy',
                ),
              ],
            ],
          ),
        ),
        if (state.academies.isEmpty)
          const EmptyState(
            title: '아직 연결된 학원이 없습니다',
            body: '학원에서 보낸 초대 링크를 열거나 앱 알림에서 초대를 수락하면 학원별 과제와 자료가 표시됩니다.',
          ),
      ],
    );
  }
}
