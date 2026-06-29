import 'package:flutter/material.dart';

import '../app/theme.dart';

class AppScaffold extends StatelessWidget {
  const AppScaffold({
    required this.title,
    required this.children,
    this.subtitle,
    this.actions,
    super.key,
  });

  final String title;
  final String? subtitle;
  final List<Widget>? actions;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final hasHeader = title.trim().isNotEmpty || subtitle != null;
    return Scaffold(
      appBar: AppBar(actions: actions),
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            if (hasHeader)
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                sliver: SliverToBoxAdapter(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (title.trim().isNotEmpty)
                        Text(
                          title,
                          style: Theme.of(context).textTheme.headlineMedium
                              ?.copyWith(fontWeight: FontWeight.w900),
                        ),
                      if (subtitle != null) ...[
                        if (title.trim().isNotEmpty) const SizedBox(height: 8),
                        Text(
                          subtitle!,
                          style: const TextStyle(
                            color: AppColors.muted,
                            height: 1.45,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(20, hasHeader ? 0 : 12, 20, 28),
              sliver: SliverList.separated(
                itemCount: children.length,
                itemBuilder: (context, index) => children[index],
                separatorBuilder: (_, _) => const SizedBox(height: 14),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
