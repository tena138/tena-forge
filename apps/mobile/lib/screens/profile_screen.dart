import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/premium_card.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<StudentAppState>();
    return AppScaffold(
      title: '프로필 / 설정',
      subtitle: '학생 개인 데이터와 학원 연결 데이터를 분리해 관리합니다.',
      children: [
        PremiumCard(
          title: '계정',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(state.profile?.email ?? '로그인 정보 없음', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              const SizedBox(height: 12),
              const Text(
                '개인 캘린더와 개인 오답은 기본적으로 비공개입니다. 학원 컨텍스트의 자료와 과제는 해당 학원 멤버십이 활성 상태일 때만 표시됩니다.',
                style: TextStyle(color: AppColors.muted, height: 1.5),
              ),
            ],
          ),
        ),
        OutlinedButton(
          onPressed: () async {
            await context.read<StudentAppState>().logout();
            if (context.mounted) context.go('/login');
          },
          child: const Text('로그아웃'),
        ),
      ],
    );
  }
}

