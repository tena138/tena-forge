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
    'name': '학생 이름',
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
      title: '프로필',
      subtitle: '학원 키를 등록할 때 필요한 학생 정보는 여기 저장된 기본값으로 먼저 채워집니다.',
      actions: [
        IconButton(
          tooltip: '캘린더로 이동',
          onPressed: () => context.go('/calendar'),
          icon: const Icon(Icons.calendar_month_outlined),
        ),
      ],
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
                '개인 노트와 개인 캘린더는 기본적으로 비공개입니다. 학원 자료와 일정은 학원 키가 연결된 뒤에만 표시됩니다.',
                style: TextStyle(color: AppColors.muted, height: 1.5),
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                onPressed: () => context.push('/academies'),
                icon: const Icon(Icons.key_outlined),
                label: const Text('학원 키 추가'),
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
                '학원이 요구한 항목만 키 등록 화면에서 사용됩니다. 한 번 저장해두면 여러 학원 키를 등록할 때 반복 입력을 줄일 수 있습니다.',
                style: TextStyle(color: AppColors.muted, height: 1.5),
              ),
              const SizedBox(height: 12),
              ...fieldLabels.entries.map(
                (entry) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: TextField(
                    controller: controllerFor(entry.key),
                    keyboardType: entry.key.contains('phone')
                        ? TextInputType.phone
                        : TextInputType.text,
                    decoration: InputDecoration(labelText: entry.value),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: saving ? null : savePersonalInfo,
                  child: Text(saving ? '저장 중' : '저장'),
                ),
              ),
            ],
          ),
        ),
        OutlinedButton.icon(
          onPressed: () async {
            await context.read<StudentAppState>().logout();
            if (context.mounted) context.go('/login');
          },
          icon: const Icon(Icons.logout_rounded),
          label: const Text('로그아웃'),
        ),
      ],
    );
  }
}
