import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/premium_card.dart';

class RegisterAcademyKeyScreen extends StatefulWidget {
  const RegisterAcademyKeyScreen({super.key});

  @override
  State<RegisterAcademyKeyScreen> createState() => _RegisterAcademyKeyScreenState();
}

class _RegisterAcademyKeyScreenState extends State<RegisterAcademyKeyScreen> {
  final codeController = TextEditingController();
  bool loading = false;

  @override
  void dispose() {
    codeController.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (codeController.text.trim().isEmpty) return;
    setState(() => loading = true);
    try {
      await context.read<StudentAppState>().claimAcademyKey(codeController.text.trim());
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('학원 키가 등록되었습니다.')));
      context.go('/academies');
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('코드가 만료되었거나 이미 배정된 좌석입니다.')));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: '학원 키 등록',
      subtitle: '학원에서 받은 초대 코드를 입력하면 해당 학원의 과제, 자료, 일정, 추가 quota가 열립니다.',
      children: [
        PremiumCard(
          title: 'Academy Access',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: codeController,
                textCapitalization: TextCapitalization.characters,
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 1.6),
                decoration: const InputDecoration(hintText: 'XXXX-XXXX-XXXX', labelText: '초대 코드'),
              ),
              const SizedBox(height: 14),
              FilledButton(onPressed: loading ? null : submit, child: Text(loading ? '확인 중...' : '학원 연결')),
            ],
          ),
        ),
        const PremiumCard(
          title: '좌석과 초대 코드는 다릅니다',
          child: Text(
            '좌석은 학원이 소유하는 재사용 가능한 접근 단위이고, 초대 코드는 학생이 좌석을 claim하는 자격 증명입니다. 학생이 퇴원하면 학원은 좌석을 해제하고 코드를 회전할 수 있습니다.',
            style: TextStyle(color: AppColors.muted, height: 1.5),
          ),
        ),
      ],
    );
  }
}

