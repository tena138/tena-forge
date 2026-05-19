import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/premium_card.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final emailController = TextEditingController();
  final passwordController = TextEditingController();
  bool loading = false;

  @override
  void dispose() {
    emailController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() => loading = true);
    try {
      await context.read<StudentAppState>().login(emailController.text.trim(), passwordController.text);
      if (mounted) context.go('/');
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('로그인에 실패했습니다. 기존 Tena 계정 정보를 확인하세요.')));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: 'Tena 통합 로그인',
      subtitle: '학생 앱은 같은 계정으로 로그인하고 학원 키를 등록해 학원 기능을 엽니다.',
      children: [
        PremiumCard(
          child: Column(
            children: [
              TextField(controller: emailController, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: '이메일')),
              const SizedBox(height: 12),
              TextField(controller: passwordController, obscureText: true, decoration: const InputDecoration(labelText: '비밀번호')),
              const SizedBox(height: 16),
              FilledButton(onPressed: loading ? null : submit, child: Text(loading ? '로그인 중...' : '로그인')),
            ],
          ),
        ),
        const Text(
          '로그인 없이도 개발 환경에서는 일부 화면이 mock 데이터로 표시됩니다. 실제 키 등록과 제출은 백엔드 인증이 필요합니다.',
          style: TextStyle(color: AppColors.muted, height: 1.5),
        ),
      ],
    );
  }
}

