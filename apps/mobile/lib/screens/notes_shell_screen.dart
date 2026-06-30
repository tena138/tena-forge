import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app/theme.dart';

class NotesShellScreen extends StatelessWidget {
  const NotesShellScreen({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        bottom: false,
        child: Row(
          children: [
            _NotesSideToolbar(navigationShell: navigationShell),
            Expanded(child: navigationShell),
          ],
        ),
      ),
    );
  }
}

class _NotesSideToolbar extends StatelessWidget {
  const _NotesSideToolbar({required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 64,
      decoration: const BoxDecoration(
        color: AppColors.panel,
        border: Border(right: BorderSide(color: AppColors.border)),
      ),
      child: Column(
        children: [
          const Spacer(),
          _SideToolbarButton(
            selected: navigationShell.currentIndex == 0,
            icon: Icons.calendar_month_outlined,
            selectedIcon: Icons.calendar_month_rounded,
            tooltip: 'Calendar',
            onPressed: () => _goBranch(0),
          ),
          const SizedBox(height: 14),
          _SideToolbarButton(
            selected: navigationShell.currentIndex == 1,
            icon: Icons.grid_view_rounded,
            selectedIcon: Icons.grid_view_rounded,
            tooltip: 'Notes',
            onPressed: () => _goBranch(1),
          ),
          const Spacer(),
        ],
      ),
    );
  }

  void _goBranch(int index) {
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }
}

class _SideToolbarButton extends StatelessWidget {
  const _SideToolbarButton({
    required this.selected,
    required this.icon,
    required this.selectedIcon,
    required this.tooltip,
    required this.onPressed,
  });

  final bool selected;
  final IconData icon;
  final IconData selectedIcon;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onPressed,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 140),
          curve: Curves.easeOut,
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: selected ? AppColors.panelSoft : Colors.transparent,
            shape: BoxShape.circle,
          ),
          child: Icon(
            selected ? selectedIcon : icon,
            size: 26,
            color: selected ? AppColors.text : AppColors.muted,
          ),
        ),
      ),
    );
  }
}
