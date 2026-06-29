import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../core/api_client.dart';
import '../models/student_models.dart';
import '../state/note_library_state.dart';
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

  String _cleanKey() =>
      _keyController.text.trim().toUpperCase().replaceAll(RegExp(r'\s+'), '');

  String _errorText(Object error, String fallback) {
    if (error is! ApiException) return fallback;
    final code = _apiErrorCode(error);
    return switch (code) {
      'KEY_NOT_FOUND' => '존재하지 않는 학원 키입니다. 문자와 하이픈을 다시 확인해 주세요.',
      'KEY_INACTIVE' => '비활성화되었거나 해제된 학원 키입니다. 학원에 새 키를 요청해 주세요.',
      'KEY_MISSING_CLASS' => '클래스가 배정되지 않은 키입니다. 학원에서 클래스 키를 다시 발급해야 합니다.',
      'KEY_ALREADY_CLAIMED' => '이미 다른 학생 계정에 연결된 학원 키입니다.',
      'CLASS_ALREADY_CONNECTED' => '이미 이 클래스가 현재 계정에 연결되어 있습니다.',
      'STUDENT_PROFILE_REQUIRED' => '학원에서 요구한 필수 학생 정보를 입력해 주세요.',
      _ =>
        error.statusCode == 404
            ? '존재하지 않는 학원 키입니다. 문자와 하이픈을 다시 확인해 주세요.'
            : error.statusCode == 410
            ? '비활성화되었거나 해제된 학원 키입니다. 학원에 새 키를 요청해 주세요.'
            : error.statusCode == 409
            ? '이미 사용되었거나 현재 계정에 등록할 수 없는 학원 키입니다.'
            : error.statusCode == 422
            ? '이 키는 지금 학생 앱에 등록할 수 없습니다. 학원에 확인해 주세요.'
            : error.displayMessage,
    };
  }

  String? _apiErrorCode(ApiException error) {
    try {
      final decoded = jsonDecode(error.message);
      if (decoded is Map) {
        final detail = decoded['detail'];
        if (detail is Map && detail['code'] is String) {
          return detail['code'] as String;
        }
        if (decoded['code'] is String) return decoded['code'] as String;
      }
    } catch (_) {
      // Use the status-code fallback in _errorText.
    }
    return null;
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
        '${missing.map((field) => field.label).join(', ')} 입력이 필요합니다.',
      );
      return;
    }

    setState(() => _claiming = true);
    try {
      final state = context.read<StudentAppState>();
      final noteLibrary = context.read<NoteLibraryState>();
      final profilePayload = _profilePayload();
      await state.claimAcademyKey(code, studentProfile: profilePayload);
      if (profilePayload.isNotEmpty) {
        var nextInfo = state.personalInfo;
        for (final entry in profilePayload.entries) {
          nextInfo = nextInfo.copyWithValue(entry.key, entry.value);
        }
        await state.savePersonalInfo(nextInfo);
      }
      noteLibrary.syncAcademyMaterials(
        academies: state.academies,
        materials: state.materials,
      );
      if (!mounted) return;
      _keyController.clear();
      for (final controller in _profileControllers.values) {
        controller.clear();
      }
      setState(() {
        _requirements = null;
        _checkedCode = null;
      });
      _showMessage('학원 키가 등록되었습니다. 캘린더에 일정이 반영됩니다.');
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
      title: '학원 키 추가',
      subtitle: '학원에서 받은 키를 입력하면 해당 클래스 자리가 이 계정에 연결되고, 일정과 자료가 자동으로 동기화됩니다.',
      actions: [
        IconButton(
          tooltip: '캘린더로 이동',
          onPressed: () => context.go('/calendar'),
          icon: const Icon(Icons.calendar_month_outlined),
        ),
      ],
      children: [
        PremiumCard(
          title: '키 입력',
          eyebrow: '1단계',
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
                    : const Icon(Icons.search_rounded),
                label: Text(_checking ? '확인 중' : '키 확인'),
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
        PremiumCard(
          title: '연결된 학원',
          eyebrow: '현재 계정',
          child: Column(
            children: [
              const ListItemCard(
                title: '개인 공간',
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
                  badge: 'connected',
                ),
              ],
            ],
          ),
        ),
        if (state.academies.isEmpty)
          const EmptyState(
            title: '아직 연결된 학원이 없습니다',
            body: '학원 키를 등록하면 클래스 일정, 과제, 자료 폴더가 Tena Note에 표시됩니다.',
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
            const _StepLabel(text: '2단계 · 연결 정보 확인'),
            const SizedBox(height: 10),
            _ConnectionSummary(
              academyName: requirements.academyName,
              className: requirements.className,
            ),
            if (fields.isNotEmpty) ...[
              const SizedBox(height: 14),
              const _StepLabel(text: '3단계 · 학생 정보 확인'),
              const SizedBox(height: 10),
              for (final field in fields) ...[
                TextField(
                  controller: controllers[field.key],
                  keyboardType: field.key.contains('phone')
                      ? TextInputType.phone
                      : TextInputType.text,
                  decoration: InputDecoration(
                    labelText: '${field.label}${field.required ? ' *' : ''}',
                    helperText: field.realName ? '학원이 실명 입력을 요구한 항목입니다.' : null,
                  ),
                ),
                const SizedBox(height: 10),
              ],
            ] else ...[
              const SizedBox(height: 12),
              const Text(
                '이 학원은 추가 학생 정보를 요구하지 않습니다.',
                style: TextStyle(color: AppColors.muted),
              ),
            ],
            const SizedBox(height: 4),
            FilledButton.icon(
              onPressed: claiming ? null : onClaim,
              icon: claiming
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.check_circle_outline_rounded),
              label: Text(claiming ? '등록 중' : '등록하고 캘린더로 이동'),
            ),
          ],
        ),
      ),
    );
  }
}

class _StepLabel extends StatelessWidget {
  const _StepLabel({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: AppColors.muted,
        fontSize: 12,
        fontWeight: FontWeight.w900,
      ),
    );
  }
}

class _ConnectionSummary extends StatelessWidget {
  const _ConnectionSummary({required this.academyName, this.className});

  final String academyName;
  final String? className;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.panel,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          const Icon(Icons.school_outlined),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  academyName,
                  style: const TextStyle(
                    color: AppColors.text,
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  className == null || className!.isEmpty
                      ? '클래스 정보 없음'
                      : className!,
                  style: const TextStyle(color: AppColors.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
