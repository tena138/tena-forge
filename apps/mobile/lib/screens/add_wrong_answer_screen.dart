import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/premium_card.dart';

class AddWrongAnswerScreen extends StatefulWidget {
  const AddWrongAnswerScreen({super.key});

  @override
  State<AddWrongAnswerScreen> createState() => _AddWrongAnswerScreenState();
}

class _AddWrongAnswerScreenState extends State<AddWrongAnswerScreen> {
  final memoController = TextEditingController();
  XFile? image;

  @override
  void dispose() {
    memoController.dispose();
    super.dispose();
  }

  Future<void> capture() async {
    final picker = ImagePicker();
    final result = await picker.pickImage(source: ImageSource.camera, imageQuality: 88);
    if (result != null) setState(() => image = result);
  }

  Future<void> save() async {
    await context.read<StudentAppState>().addWrongAnswer(
      sourceType: 'personal_photo',
      problemText: memoController.text.trim().isEmpty ? '사진 오답 - OCR 대기' : memoController.text.trim(),
      memo: memoController.text.trim(),
    );
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('개인 오답노트에 비공개로 저장했습니다.')));
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: '사진으로 오답 추가',
      subtitle: '촬영한 문제는 개인 오답으로 비공개 저장됩니다. 학원 공유는 학생이 명시적으로 허용한 경우에만 확장합니다.',
      children: [
        PremiumCard(
          title: 'Camera',
          child: Column(
            children: [
              Container(
                height: 220,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: const Color(0x0DFFFFFF),
                  border: Border.all(color: AppColors.border),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Text(image?.name ?? '촬영된 이미지 없음', style: const TextStyle(color: AppColors.muted)),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(onPressed: capture, icon: const Icon(Icons.camera_alt), label: Text(image == null ? '카메라 열기' : '다시 촬영')),
            ],
          ),
        ),
        PremiumCard(
          title: '문항 메모',
          child: TextField(
            controller: memoController,
            minLines: 4,
            maxLines: 8,
            decoration: const InputDecoration(hintText: '문항 내용이나 복습 메모'),
          ),
        ),
        FilledButton(onPressed: save, child: const Text('오답 저장')),
      ],
    );
  }
}

