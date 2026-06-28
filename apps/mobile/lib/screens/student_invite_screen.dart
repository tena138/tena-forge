import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../core/api_client.dart';
import '../models/student_models.dart';
import '../state/student_app_state.dart';

class StudentInviteScreen extends StatefulWidget {
  const StudentInviteScreen({super.key, required this.token});

  final String token;

  @override
  State<StudentInviteScreen> createState() => _StudentInviteScreenState();
}

class _StudentInviteScreenState extends State<StudentInviteScreen> {
  late Future<StudentInvitePreview> _previewFuture;
  bool _claiming = false;

  @override
  void initState() {
    super.initState();
    _previewFuture = context.read<StudentAppState>().loadStudentInvite(
      widget.token,
    );
  }

  void _reload() {
    setState(() {
      _previewFuture = context.read<StudentAppState>().loadStudentInvite(
        widget.token,
      );
    });
  }

  Future<void> _claim() async {
    setState(() => _claiming = true);
    try {
      final membership = await context
          .read<StudentAppState>()
          .claimStudentInvite(widget.token);
      if (!mounted) return;
      final academyName = membership.academyName ?? 'Academy';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$academyName has been connected.')),
      );
      context.go('/calendar');
    } catch (error) {
      if (!mounted) return;
      final message = error is ApiException
          ? error.displayMessage
          : 'Could not connect this invite.';
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(message)));
      _reload();
    } finally {
      if (mounted) setState(() => _claiming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: AppColors.panel,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: AppColors.border),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x12000000),
                      blurRadius: 26,
                      offset: Offset(0, 16),
                    ),
                  ],
                ),
                child: Padding(
                  padding: const EdgeInsets.all(22),
                  child: FutureBuilder<StudentInvitePreview>(
                    future: _previewFuture,
                    builder: (context, snapshot) {
                      if (snapshot.connectionState == ConnectionState.waiting) {
                        return const SizedBox(
                          height: 220,
                          child: Center(child: CircularProgressIndicator()),
                        );
                      }
                      if (snapshot.hasError) {
                        final error = snapshot.error;
                        final message = error is ApiException
                            ? error.displayMessage
                            : 'Invite link could not be loaded.';
                        return _InviteError(message: message, onRetry: _reload);
                      }
                      final invite = snapshot.data!;
                      return _InviteContent(
                        invite: invite,
                        claiming: _claiming,
                        onClaim: _claim,
                        onCancel: () => context.go('/calendar'),
                      );
                    },
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _InviteContent extends StatelessWidget {
  const _InviteContent({
    required this.invite,
    required this.claiming,
    required this.onClaim,
    required this.onCancel,
  });

  final StudentInvitePreview invite;
  final bool claiming;
  final VoidCallback onClaim;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final studentName = invite.studentName?.isNotEmpty == true
        ? invite.studentName!
        : 'this student';
    final className = invite.className?.isNotEmpty == true
        ? invite.className!
        : 'assigned class';
    final alreadyClaimed = invite.status == 'claimed';

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.mark_email_read_outlined, size: 42),
        const SizedBox(height: 18),
        Text(
          'Connect academy invite',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.text,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          '${invite.academyName} wants to connect your account as $studentName.',
          style: Theme.of(
            context,
          ).textTheme.bodyLarge?.copyWith(color: AppColors.text),
        ),
        const SizedBox(height: 18),
        _InfoRow(label: 'Academy', value: invite.academyName),
        _InfoRow(label: 'Student', value: studentName),
        _InfoRow(label: 'Class', value: className),
        const SizedBox(height: 22),
        if (alreadyClaimed)
          const _StatusBox(
            text: 'This invite has already been used and cannot be claimed again.',
          )
        else if (!invite.canClaim)
          const _StatusBox(
            text: 'This invite is no longer available. Ask the academy for a new link.',
          )
        else
          Text(
            'After connecting, this account will receive schedules, assignments, notices, and calendar items from this academy together with your other academies.',
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: AppColors.muted),
          ),
        const SizedBox(height: 24),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: claiming ? null : onCancel,
                child: const Text('Later'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton(
                onPressed: invite.canClaim && !claiming ? onClaim : null,
                child: claiming
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Connect'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 86,
            child: Text(
              label,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: AppColors.muted),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: AppColors.text,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusBox extends StatelessWidget {
  const _StatusBox({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Text(
          text,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: AppColors.muted),
        ),
      ),
    );
  }
}

class _InviteError extends StatelessWidget {
  const _InviteError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(Icons.link_off, size: 42),
        const SizedBox(height: 16),
        Text(
          'Invite unavailable',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.text,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          message,
          style: Theme.of(
            context,
          ).textTheme.bodyMedium?.copyWith(color: AppColors.muted),
        ),
        const SizedBox(height: 22),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => context.go('/calendar'),
                child: const Text('Back'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton(
                onPressed: onRetry,
                child: const Text('Retry'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
