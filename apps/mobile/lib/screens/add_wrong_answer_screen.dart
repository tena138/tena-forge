import 'dart:io';

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
  bool saving = false;

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
    if (image == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('오답 사진을 먼저 촬영해주세요.')),
      );
      return;
    }

    setState(() => saving = true);
    try {
      final memo = memoController.text.trim();
      await context.read<StudentAppState>().addWrongAnswer(
            sourceType: 'personal_photo',
            problemText: memo.isEmpty ? '사진 오답 - OCR 대기' : memo,
            memo: memo,
            imagePath: image!.path,
            imageName: image!.name,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('개인 오답 아카이브에 저장했습니다.')),
        );
        Navigator.of(context).pop();
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: '사진으로 오답 추가',
      subtitle: '교재 PDF 추출 없이, 학생이 직접 찍은 문제 사진을 개인 오답 아카이브에 저장합니다.',
      children: [
        PremiumCard(
          title: '오답 사진',
          child: Column(
            children: [
              Container(
                height: 260,
                width: double.infinity,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  color: const Color(0x0DFFFFFF),
                  border: Border.all(color: AppColors.border),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: image == null
                    ? const Center(
                        child: Text('촬영한 이미지가 없습니다', style: TextStyle(color: AppColors.muted)),
                      )
                    : Image.file(File(image!.path), fit: BoxFit.cover),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: saving ? null : capture,
                icon: const Icon(Icons.camera_alt),
                label: Text(image == null ? '카메라 열기' : '다시 촬영'),
              ),
            ],
          ),
        ),
        PremiumCard(
          title: '복습 메모',
          child: TextField(
            controller: memoController,
            minLines: 4,
            maxLines: 8,
            decoration: const InputDecoration(hintText: '틀린 이유, 풀이 포인트, 다시 볼 단원을 적어두세요'),
          ),
        ),
        FilledButton.icon(
          onPressed: saving ? null : save,
          icon: saving
              ? const SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.archive_outlined),
          label: Text(saving ? '저장 중' : '오답 저장'),
        ),
      ],
    );
  }
}
