import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../core/api_client.dart';
import '../models/student_models.dart';
import '../state/student_app_state.dart';
import '../widgets/app_scaffold.dart';
import '../widgets/empty_state.dart';
import '../widgets/list_item_card.dart';
import '../widgets/premium_card.dart';

String _shortSeatId(String value) =>
    value.length <= 8 ? value : value.substring(0, 8);

class AcademiesScreen extends StatefulWidget {
  const AcademiesScreen({super.key});

  @override
  State<AcademiesScreen> createState() => _AcademiesScreenState();
}

class _AcademiesScreenState extends State<AcademiesScreen> {
  final TextEditingController _keyController = TextEditingController();
  final Map<String, TextEditingController> _profileControllers = {};
  AcademyKeyRequirements? _requirements;
  String? _checkedCode;
  bool _checking = false;
  bool _claiming = false;

  @override
  void dispose() {
    _keyController.dispose();
    for (final controller in _profileControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  String _cleanKey() => _keyController.text.trim().toUpperCase();

  String _errorText(Object error, String fallback) {
    if (error is ApiException) return error.displayMessage;
    return fallback;
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  String _initialProfileValue(
    StudentProfileRequirementField field,
    StudentAppState state,
  ) {
    final stored = state.personalInfo.value(field.key);
    if (stored.isNotEmpty) return stored;
    if (field.key == 'name') return state.profile?.displayName ?? '';
    return '';
  }

  void _setRequirements(
    AcademyKeyRequirements requirements,
    StudentAppState state,
  ) {
    for (final controller in _profileControllers.values) {
      controller.dispose();
    }
    _profileControllers.clear();
    for (final field in requirements.enabledFields) {
      _profileControllers[field.key] = TextEditingController(
        text: _initialProfileValue(field, state),
      );
    }
    _requirements = requirements;
    _checkedCode = _cleanKey();
  }

  Map<String, String> _profilePayload() {
    return {
      for (final entry in _profileControllers.entries)
        if (entry.value.text.trim().isNotEmpty)
          entry.key: entry.value.text.trim(),
    };
  }

  List<StudentProfileRequirementField> _missingRequiredFields() {
    final requirements = _requirements;
    if (requirements == null) return const [];
    return requirements.enabledFields
        .where(
          (field) =>
              field.required &&
              (_profileControllers[field.key]?.text.trim().isEmpty ?? true),
        )
        .toList(growable: false);
  }

  Future<void> _checkKey() async {
    final code = _cleanKey();
    if (code.isEmpty) {
      _showMessage('학원 키를 입력해 주세요.');
      return;
    }
    setState(() {
      _checking = true;
      _requirements = null;
      _checkedCode = null;
    });
    try {
      final state = context.read<StudentAppState>();
      final requirements = await state.loadAcademyKeyRequirements(code);
      if (!mounted) return;
      setState(() => _setRequirements(requirements, state));
    } catch (error) {
      if (!mounted) return;
      _showMessage(_errorText(error, '학원 키를 확인하지 못했습니다.'));
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  Future<void> _claimKey() async {
    final code = _checkedCode ?? _cleanKey();
    if (code.isEmpty || _requirements == null) {
      await _checkKey();
      return;
    }
    final missing = _missingRequiredFields();
    if (missing.isNotEmpty) {
      _showMessage(
        '${missing.map((field) => field.label).join(', ')}을 입력해 주세요.',
      );
      return;
    }
    setState(() => _claiming = true);
    try {
      await context.read<StudentAppState>().claimAcademyKey(
        code,
        studentProfile: _profilePayload(),
      );
      if (!mounted) return;
      _showMessage('학원 키가 등록되었습니다.');
      context.go('/calendar');
    } catch (error) {
      if (!mounted) return;
      _showMessage(_errorText(error, '학원 키를 등록하지 못했습니다.'));
    } finally {
      if (mounted) setState(() => _claiming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<StudentAppState>();
    return AppScaffold(
      title: '연결된 학원',
      subtitle: '학원에서 받은 키를 추가하면 해당 클래스 일정, 과제, 자료가 앱에 연결됩니다.',
      actions: [
        IconButton(
          tooltip: '캘린더',
          onPressed: () => context.go('/calendar'),
          icon: const Icon(Icons.calendar_month_outlined),
        ),
      ],
      children: [
        PremiumCard(
          title: '학원 키 추가',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: _keyController,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                  hintText: '예: 624N-AG8G-YAGY',
                  prefixIcon: Icon(Icons.key_outlined),
                ),
                onChanged: (_) {
                  if (_requirements != null) {
                    setState(() {
                      _requirements = null;
                      _checkedCode = null;
                    });
                  }
                },
                onSubmitted: (_) => _checkKey(),
              ),
              const SizedBox(height: 10),
              FilledButton.icon(
                onPressed: _checking ? null : _checkKey,
                icon: _checking
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.search),
                label: const Text('키 확인'),
              ),
              if (_requirements != null) ...[
                const SizedBox(height: 14),
                _AcademyKeyRequirementsCard(
                  requirements: _requirements!,
                  controllers: _profileControllers,
                  claiming: _claiming,
                  onClaim: _claimKey,
                ),
              ],
            ],
          ),
        ),
        if (state.academyInvites.isNotEmpty)
          PremiumCard(
            title: '받은 앱 초대',
            child: Column(
              children: [
                for (final invite in state.academyInvites) ...[
                  ListItemCard(
                    title: invite.academyName,
                    subtitle: [invite.className, invite.studentName]
                        .whereType<String>()
                        .where((value) => value.isNotEmpty)
                        .join(' · '),
                    badge: 'pending',
                    trailing: Wrap(
                      spacing: 6,
                      children: [
                        FilledButton(
                          onPressed: () {
                            state.acceptAcademyInvite(invite);
                          },
                          child: const Text('수락'),
                        ),
                        OutlinedButton(
                          onPressed: () {
                            state.declineAcademyInvite(invite);
                          },
                          child: const Text('거절'),
                        ),
                      ],
                    ),
                  ),
                  if (invite != state.academyInvites.last)
                    const SizedBox(height: 10),
                ],
              ],
            ),
          ),
        PremiumCard(
          title: '학원 연결',
          child: Column(
            children: [
              const ListItemCard(
                title: 'Personal',
                subtitle: '개인 캘린더와 개인 노트입니다. 학원에는 공개되지 않습니다.',
                badge: 'private',
              ),
              for (final academy in state.academies) ...[
                const SizedBox(height: 10),
                ListItemCard(
                  title: academy.academyName ?? academy.academyId,
                  subtitle:
                      [
                            academy.className,
                            '좌석 ${_shortSeatId(academy.academySeatId)}',
                            academy.status,
                          ]
                          .whereType<String>()
                          .where((value) => value.isNotEmpty)
                          .join(' · '),
                  badge: 'academy',
                ),
              ],
            ],
          ),
        ),
        if (state.academies.isEmpty)
          const EmptyState(
            title: '아직 연결된 학원이 없습니다',
            body: '학원에서 받은 키를 입력하면 클래스 일정, 과제, 자료가 앱에 표시됩니다.',
          ),
      ],
    );
  }
}

class _AcademyKeyRequirementsCard extends StatelessWidget {
  const _AcademyKeyRequirementsCard({
    required this.requirements,
    required this.controllers,
    required this.claiming,
    required this.onClaim,
  });

  final AcademyKeyRequirements requirements;
  final Map<String, TextEditingController> controllers;
  final bool claiming;
  final VoidCallback onClaim;

  @override
  Widget build(BuildContext context) {
    final fields = requirements.enabledFields.toList(growable: false);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.panelSoft,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              requirements.academyName,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900),
            ),
            if (requirements.className != null) ...[
              const SizedBox(height: 4),
              Text(
                requirements.className!,
                style: const TextStyle(color: AppColors.muted),
              ),
            ],
            if (fields.isNotEmpty) ...[
              const SizedBox(height: 14),
              for (final field in fields) ...[
                TextField(
                  controller: controllers[field.key],
                  decoration: InputDecoration(
                    labelText: '${field.label}${field.required ? ' *' : ''}',
                    helperText: field.realName ? '학원이 실명 입력을 요구했습니다.' : null,
                  ),
                ),
                const SizedBox(height: 10),
              ],
            ],
            FilledButton.icon(
              onPressed: claiming ? null : onClaim,
              icon: claiming
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.check_circle_outline),
              label: const Text('이 학원 연결하기'),
            ),
          ],
        ),
      ),
    );
  }
}
