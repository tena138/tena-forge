import 'package:flutter/material.dart';

import '../app/theme.dart';

Future<bool> confirmTestStart(
  BuildContext context, {
  required String title,
  int? timeLimitMinutes,
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('시험을 시작할까요?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: AppColors.text,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            timeLimitMinutes == null
                ? '시작하면 답안 입력 시간이 기록되고, 제출 후 재열람이 제한됩니다.'
                : '시작하면 $timeLimitMinutes분 타이머가 진행되고, 제출 후 재열람이 제한됩니다.',
          ),
          const SizedBox(height: 8),
          const Text('제한 시간이 끝나면 현재 답안으로 자동 제출됩니다.'),
        ],
      ),
      actionsPadding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
      actions: [
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('취소'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton(
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('시작'),
              ),
            ),
          ],
        ),
      ],
    ),
  );
  return confirmed == true;
}
