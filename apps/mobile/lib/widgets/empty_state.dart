import 'package:flutter/material.dart';

import '../app/theme.dart';

class EmptyState extends StatelessWidget {
  const EmptyState({required this.title, this.body, super.key});

  final String title;
  final String? body;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.panelSoft,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16),
          ),
          if (body != null) ...[
            const SizedBox(height: 8),
            Text(
              body!,
              style: const TextStyle(color: AppColors.muted, height: 1.45),
            ),
          ],
        ],
      ),
    );
  }
}
