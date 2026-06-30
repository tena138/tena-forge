import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../models/student_models.dart';
import '../state/student_app_state.dart';

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
          _SideToolbarButton(
            selected: false,
            icon: Icons.settings_outlined,
            selectedIcon: Icons.settings_rounded,
            tooltip: '설정',
            compact: true,
            onPressed: () => _showSettingsPanel(context),
          ),
          const SizedBox(height: 14),
          _ProfileToolbarButton(onPressed: () => _showProfilePanel(context)),
          const SizedBox(height: 18),
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

  void _showProfilePanel(BuildContext context) {
    _showSidePanel(
      context,
      Consumer<StudentAppState>(
        builder: (context, state, _) => _ProfilePanel(state: state),
      ),
    );
  }

  void _showSettingsPanel(BuildContext context) {
    _showSidePanel(
      context,
      Consumer<StudentAppState>(
        builder: (context, state, _) => _SettingsPanel(state: state),
      ),
    );
  }
}

Future<void> _showSidePanel(BuildContext context, Widget child) {
  return showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: '패널 닫기',
    barrierColor: Colors.transparent,
    transitionDuration: const Duration(milliseconds: 140),
    pageBuilder: (context, _, _) {
      final media = MediaQuery.of(context);
      final panelWidth = (media.size.width - 96).clamp(280.0, 360.0);
      return Material(
        color: Colors.transparent,
        child: Stack(
          children: [
            Positioned(
              left: 72,
              bottom: media.padding.bottom + 18,
              width: panelWidth.toDouble(),
              child: child,
            ),
          ],
        ),
      );
    },
    transitionBuilder: (context, animation, _, child) {
      final curved = CurvedAnimation(parent: animation, curve: Curves.easeOut);
      return FadeTransition(
        opacity: curved,
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(-0.04, 0.04),
            end: Offset.zero,
          ).animate(curved),
          child: child,
        ),
      );
    },
  );
}

class _SideToolbarButton extends StatelessWidget {
  const _SideToolbarButton({
    required this.selected,
    required this.icon,
    required this.selectedIcon,
    required this.tooltip,
    required this.onPressed,
    this.compact = false,
  });

  final bool selected;
  final IconData icon;
  final IconData selectedIcon;
  final String tooltip;
  final VoidCallback onPressed;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final size = compact ? 42.0 : 48.0;
    final iconSize = compact ? 22.0 : 26.0;
    return Tooltip(
      message: tooltip,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onPressed,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 140),
          curve: Curves.easeOut,
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: selected ? AppColors.panelSoft : Colors.transparent,
            shape: BoxShape.circle,
          ),
          child: Icon(
            selected ? selectedIcon : icon,
            size: iconSize,
            color: selected ? AppColors.text : AppColors.muted,
          ),
        ),
      ),
    );
  }
}

class _ProfileToolbarButton extends StatelessWidget {
  const _ProfileToolbarButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final profile = context.watch<StudentAppState>().profile;
    return Tooltip(
      message: '프로필',
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onPressed,
        child: Container(
          width: 42,
          height: 42,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: AppColors.text,
            shape: BoxShape.circle,
          ),
          child: Text(
            _initialFor(profile),
            style: const TextStyle(
              color: AppColors.panel,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ),
    );
  }
}

class _ProfilePanel extends StatelessWidget {
  const _ProfilePanel({required this.state});

  final StudentAppState state;

  @override
  Widget build(BuildContext context) {
    final profile = state.profile;
    final displayName = _displayNameFor(profile);
    final profileName = _profileNameFor(profile);
    return _SidePanelFrame(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                alignment: Alignment.center,
                decoration: const BoxDecoration(
                  color: AppColors.text,
                  shape: BoxShape.circle,
                ),
                child: Text(
                  _initialFor(profile),
                  style: const TextStyle(
                    color: AppColors.panel,
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      '내 프로필',
                      style: TextStyle(
                        color: AppColors.muted,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.text,
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      profileName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.muted,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _InfoRow(
            icon: Icons.mail_outline_rounded,
            label: '이메일',
            value: profile?.email ?? '-',
          ),
          _InfoRow(
            icon: Icons.school_outlined,
            label: '학원',
            value: '${state.academies.length}',
          ),
          _InfoRow(
            icon: Icons.mark_email_unread_outlined,
            label: '받은 초대',
            value: '${state.academyInvites.length}',
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () {
                    Navigator.of(context).pop();
                  },
                  icon: const Icon(Icons.close_rounded),
                  label: const Text('닫기'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () async {
                    final router = GoRouter.of(context);
                    await context.read<StudentAppState>().logout();
                    if (!context.mounted) return;
                    Navigator.of(context).pop();
                    router.go('/login');
                  },
                  icon: const Icon(Icons.logout_rounded),
                  label: const Text('로그아웃'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SettingsPanel extends StatelessWidget {
  const _SettingsPanel({required this.state});

  final StudentAppState state;

  @override
  Widget build(BuildContext context) {
    return _SidePanelFrame(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            '설정',
            style: TextStyle(
              color: AppColors.text,
              fontSize: 18,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 12),
          _SettingsAction(
            icon: Icons.sync_rounded,
            title: '새로고침',
            subtitle: state.loading ? '동기화 중' : '최신 데이터',
            onTap: state.loading
                ? null
                : () async {
                    await context.read<StudentAppState>().refresh();
                    if (context.mounted) Navigator.of(context).pop();
                  },
          ),
          _SettingsAction(
            icon: Icons.key_outlined,
            title: '학원 연결',
            subtitle: '${state.academies.length}개 연결됨',
            onTap: () {
              final router = GoRouter.of(context);
              Navigator.of(context).pop();
              router.push('/academies');
            },
          ),
          _SettingsAction(
            icon: Icons.info_outline_rounded,
            title: '앱 정보',
            subtitle: 'Tena Note',
            onTap: null,
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () async {
              final router = GoRouter.of(context);
              await context.read<StudentAppState>().logout();
              if (!context.mounted) return;
              Navigator.of(context).pop();
              router.go('/login');
            },
            icon: const Icon(Icons.logout_rounded),
            label: const Text('로그아웃'),
          ),
        ],
      ),
    );
  }
}

class _SidePanelFrame extends StatelessWidget {
  const _SidePanelFrame({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.panel,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1F000000),
            blurRadius: 24,
            offset: Offset(0, 14),
          ),
        ],
      ),
      child: Padding(padding: const EdgeInsets.all(16), child: child),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.muted),
          const SizedBox(width: 8),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.muted,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: AppColors.text,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SettingsAction extends StatelessWidget {
  const _SettingsAction({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: AppColors.panelSoft,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                Icon(icon, size: 20, color: AppColors.text),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          color: onTap == null
                              ? AppColors.subtle
                              : AppColors.text,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.muted,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  size: 20,
                  color: onTap == null ? AppColors.subtle : AppColors.muted,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

String _initialFor(StudentProfile? profile) {
  final source = profile?.displayName?.trim().isNotEmpty == true
      ? profile!.displayName!.trim()
      : profile?.profileName?.trim().isNotEmpty == true
      ? profile!.profileName!.trim()
      : profile?.email.trim();
  if (source == null || source.isEmpty) return 'T';
  return source.characters.first.toUpperCase();
}

String _displayNameFor(StudentProfile? profile) {
  final displayName = profile?.displayName?.trim();
  if (displayName != null && displayName.isNotEmpty) return displayName;
  final profileName = profile?.profileName?.trim();
  if (profileName != null && profileName.isNotEmpty) return '@$profileName';
  final email = profile?.email.trim();
  if (email != null && email.isNotEmpty) return email;
  return 'Tena Note';
}

String _profileNameFor(StudentProfile? profile) {
  final profileName = profile?.profileName?.trim();
  if (profileName != null && profileName.isNotEmpty) return '@$profileName';
  return profile?.email ?? '';
}
