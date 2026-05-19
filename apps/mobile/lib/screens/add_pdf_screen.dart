import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/premium_card.dart';

class AddPdfScreen extends StatefulWidget {
  const AddPdfScreen({super.key});

  @override
  State<AddPdfScreen> createState() => _AddPdfScreenState();
}

class _AddPdfScreenState extends State<AddPdfScreen> {
  PlatformFile? file;

  Future<void> pickPdf() async {
    final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: ['pdf']);
    if (result != null && result.files.isNotEmpty) setState(() => file = result.files.first);
  }

  Future<void> save() async {
    await context.read<StudentAppState>().addWrongAnswer(
      sourceType: 'personal_one_page_pdf',
      problemText: '${file?.name ?? '1페이지 PDF'} - 추출 대기',
      memo: '학생 PDF 업로드는 서버에서 1페이지 제한을 검증해야 합니다.',
    );
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('1페이지 PDF 오답으로 저장했습니다.')));
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: '1페이지 PDF 추가',
      subtitle: '학생 개인 PDF 업로드는 1페이지 단위만 허용합니다. 서버에서 page count를 반드시 검증해야 합니다.',
      children: [
        const PremiumCard(
          title: '정책',
          child: Text(
            '여러 페이지 PDF는 거부하거나 정확히 한 페이지 선택을 요구합니다. 이 제한은 UI가 아니라 서버에서 최종 enforcement 해야 합니다.',
            style: TextStyle(color: AppColors.muted, height: 1.5),
          ),
        ),
        PremiumCard(
          title: 'PDF 파일',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(file?.name ?? '선택된 PDF 없음', style: const TextStyle(fontWeight: FontWeight.w900)),
              const SizedBox(height: 12),
              OutlinedButton.icon(onPressed: pickPdf, icon: const Icon(Icons.picture_as_pdf), label: const Text('PDF 선택')),
            ],
          ),
        ),
        FilledButton(onPressed: file == null ? null : save, child: const Text('비공개 오답으로 저장')),
      ],
    );
  }
}

