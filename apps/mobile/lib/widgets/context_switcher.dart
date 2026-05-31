import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../state/student_app_state.dart';

class ContextSwitcher extends StatelessWidget {
  const ContextSwitcher({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<StudentAppState>();
    final items = [
      const _ContextItem(id: 'personal', label: 'Personal'),
      ...state.academies.map((academy) {
        final academyName = academy.academyName ?? 'Academy';
        final label = academy.className == null ? academyName : '$academyName · ${academy.className}';
        return _ContextItem(id: academy.id, label: label);
      }),
    ];
    return SizedBox(
      height: 42,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final item = items[index];
          final active = item.id == state.selectedContextId;
          return ChoiceChip(
            selected: active,
            label: Text(item.label),
            selectedColor: AppColors.violet.withValues(alpha: .22),
            backgroundColor: AppColors.panelSoft,
            side: BorderSide(color: active ? AppColors.violet : AppColors.border),
            labelStyle: TextStyle(color: active ? AppColors.text : AppColors.muted, fontWeight: FontWeight.w800),
            onSelected: (_) => context.read<StudentAppState>().selectContext(item.id),
          );
        },
      ),
    );
  }
}

class _ContextItem {
  const _ContextItem({required this.id, required this.label});

  final String id;
  final String label;
}
