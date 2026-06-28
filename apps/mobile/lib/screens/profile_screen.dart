import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../models/student_models.dart';
import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/premium_card.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  static const fieldLabels = {
    'name': '학생 실명',
    'school': '학교',
    'grade_level': '학년',
    'student_phone': '학생 연락처',
    'guardian_name': '보호자 이름',
    'guardian_phone': '보호자 연락처',
    'birthdate': '생년월일',
  };

  final controllers = <String, TextEditingController>{};
  bool initialized = false;
  bool saving = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (initialized) return;
    final info = context.read<StudentAppState>().personalInfo;
    for (final key in fieldLabels.keys) {
      controllerFor(key).text = info.value(key);
    }
    initialized = true;
  }

  @override
  void dispose() {
    for (final controller in controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  TextEditingController controllerFor(String key) {
    return controllers.putIfAbsent(key, () => TextEditingController());
  }

  StudentPersonalInfo buildPersonalInfo() {
    var info = const StudentPersonalInfo();
    for (final entry in controllers.entries) {
      info = info.copyWithValue(entry.key, entry.value.text);
    }
    return info;
  }

  Future<void> savePersonalInfo() async {
    setState(() => saving = true);
    try {
      await context.read<StudentAppState>().savePersonalInfo(
        buildPersonalInfo(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('기본 인적사항을 저장했습니다.')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

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
              Text(
                state.profile?.email ?? '로그인 정보 없음',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                '개인 캘린더와 개인 오답은 기본적으로 비공개입니다. 학원 컨텍스트의 자료와 과제는 해당 학원 멤버십이 활성 상태일 때만 표시됩니다.',
                style: TextStyle(color: AppColors.muted, height: 1.5),
              ),
            ],
          ),
        ),
        PremiumCard(
          title: '기본 인적사항',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '학원 초대를 수락할 때 학원이 요구한 항목만 자동으로 채워집니다.',
                style: TextStyle(color: AppColors.muted, height: 1.5),
              ),
              const SizedBox(height: 12),
              ...fieldLabels.entries.map(
                (entry) => TextField(
                  controller: controllerFor(entry.key),
                  keyboardType: entry.key.contains('phone')
                      ? TextInputType.phone
                      : TextInputType.text,
                  decoration: InputDecoration(labelText: entry.value),
                ),
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: saving ? null : savePersonalInfo,
                  child: Text(saving ? '저장 중...' : '저장'),
                ),
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
