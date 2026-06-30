import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_math_fork/flutter_math.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../app/theme.dart';
import '../core/text_encoding.dart';
import '../models/student_models.dart';
import '../state/student_app_state.dart';

class TestScreen extends StatefulWidget {
  const TestScreen({required this.assignmentId, super.key});

  final String assignmentId;

  @override
  State<TestScreen> createState() => _TestScreenState();
}

class _TestScreenState extends State<TestScreen> {
  late Future<Assignment> _assignmentFuture;
  final PageController _pageController = PageController();
  final Map<String, String> _answers = {};
  Timer? _timer;
  Assignment? _assignment;
  DateTime? _startedAt;
  int _pageIndex = 0;
  int _remainingSeconds = 0;
  bool _submitting = false;
  bool _autoSubmitted = false;

  @override
  void initState() {
    super.initState();
    _assignmentFuture = _prepareTest();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pageController.dispose();
    super.dispose();
  }

  Future<Assignment> _prepareTest() async {
    final state = context.read<StudentAppState>();
    final initial = await state.loadAssignmentDetail(widget.assignmentId);
    if (initial.isCompleted) {
      if (!mounted) return initial;
      _applyAssignment(initial, startTimer: false);
      return initial;
    }

    await state.startTest(widget.assignmentId);
    final started = await state.loadAssignmentDetail(widget.assignmentId);
    if (!mounted) return started;
    _applyAssignment(started, startTimer: true);
    return started;
  }

  void _applyAssignment(Assignment assignment, {required bool startTimer}) {
    _assignment = assignment;
    for (final problem in assignment.problems) {
      _answers.putIfAbsent(problem.id, () => '');
    }
    _startedAt = assignment.startedAt ?? DateTime.now().toUtc();
    _syncRemainingSeconds();
    _timer?.cancel();
    if (startTimer && _limitSeconds != null) {
      if (_remainingSeconds <= 0) {
        Future.microtask(() {
          if (!mounted || _autoSubmitted) return;
          _autoSubmitted = true;
          _submit(auto: true);
        });
      } else {
        _timer = Timer.periodic(
          const Duration(seconds: 1),
          (_) => _tickTimer(),
        );
      }
    }
  }

  int? get _limitSeconds {
    final assignment = _assignment;
    if (assignment == null) return null;
    final seconds = assignment.timeLimitSeconds;
    if (seconds != null && seconds > 0) return seconds;
    final minutes = assignment.timeLimitMinutes;
    if (minutes != null && minutes > 0) return minutes * 60;
    return null;
  }

  int get _elapsedSeconds {
    final startedAt = _startedAt;
    if (startedAt == null) return 0;
    return math.max(
      0,
      DateTime.now().toUtc().difference(startedAt.toUtc()).inSeconds,
    );
  }

  void _syncRemainingSeconds() {
    final limit = _limitSeconds;
    _remainingSeconds = limit == null
        ? 0
        : math.max(0, limit - _elapsedSeconds);
  }

  void _tickTimer() {
    final before = _remainingSeconds;
    _syncRemainingSeconds();
    if (mounted) setState(() {});
    if (before > 0 && _remainingSeconds <= 0 && !_autoSubmitted) {
      _autoSubmitted = true;
      _submit(auto: true);
    }
  }

  Future<void> _submit({bool auto = false}) async {
    final assignment = _assignment;
    if (assignment == null || _submitting || assignment.isCompleted) return;

    if (!auto) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('시험을 제출할까요?'),
          content: const Text('제출 후에는 이 시험을 다시 풀거나 재열람할 수 없습니다.'),
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
                    child: const Text('제출'),
                  ),
                ),
              ],
            ),
          ],
        ),
      );
      if (confirmed != true) return;
    }

    if (!mounted) return;
    final appState = context.read<StudentAppState>();
    setState(() => _submitting = true);
    try {
      final answers = assignment.problems
          .map(
            (problem) => {
              'problem_id': problem.id,
              'answer': (_answers[problem.id] ?? '').trim(),
            },
          )
          .toList(growable: false);
      await appState.submitTestAnswers(
        assignment.id,
        answers: answers,
        timeSpentSeconds: _elapsedSeconds,
      );
      _timer?.cancel();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(auto ? '제한 시간이 끝나 자동 제출했습니다.' : '시험을 제출했습니다.')),
      );
      context.go('/notes');
    } catch (_) {
      if (!mounted) return;
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('시험을 제출하지 못했습니다. 연결 상태를 확인해주세요.')),
      );
    }
  }

  void _goToPage(int index) {
    final problems = _assignment?.problems ?? const <StudentMaterialProblem>[];
    if (index < 0 || index >= problems.length) return;
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Assignment>(
      future: _assignmentFuture,
      builder: (context, snapshot) {
        final assignment = _assignment ?? snapshot.data;
        if (snapshot.connectionState != ConnectionState.done &&
            assignment == null) {
          return const Scaffold(
            body: SafeArea(child: Center(child: CircularProgressIndicator())),
          );
        }
        if (snapshot.hasError && assignment == null) {
          return _TestMessageScaffold(
            title: '시험을 열 수 없습니다.',
            message: '기한 또는 세션 상태를 확인해주세요.',
            onBack: () => context.go('/notes'),
            onRetry: () {
              setState(() {
                _assignmentFuture = _prepareTest();
              });
            },
          );
        }
        if (assignment == null) {
          return _TestMessageScaffold(
            title: '시험을 찾을 수 없습니다.',
            message: '목록을 새로고침한 뒤 다시 시도해주세요.',
            onBack: () => context.go('/notes'),
          );
        }
        if (assignment.isCompleted) {
          return _TestMessageScaffold(
            title: '이미 제출된 시험입니다.',
            message: '제출된 시험은 다시 열람하거나 다시 풀 수 없습니다.',
            onBack: () => context.go('/notes'),
          );
        }
        final problems = assignment.problems;
        if (problems.isEmpty) {
          return _TestMessageScaffold(
            title: repairKoreanText(assignment.title),
            message: '표시할 문항이 없습니다. 학원에서 할당 자료를 다시 확인해야 합니다.',
            onBack: () => context.go('/notes'),
          );
        }
        return Scaffold(
          backgroundColor: AppColors.bg,
          body: SafeArea(
            child: Column(
              children: [
                _TestToolbar(
                  title: repairKoreanText(assignment.title),
                  pageIndex: _pageIndex,
                  pageCount: problems.length,
                  remainingSeconds: _limitSeconds == null
                      ? null
                      : _remainingSeconds,
                  submitting: _submitting,
                  onBack: () => context.go('/notes'),
                  onPrevious: () => _goToPage(_pageIndex - 1),
                  onNext: () => _goToPage(_pageIndex + 1),
                  onSubmit: () => _submit(),
                ),
                Expanded(
                  child: PageView.builder(
                    controller: _pageController,
                    itemCount: problems.length,
                    onPageChanged: (index) =>
                        setState(() => _pageIndex = index),
                    itemBuilder: (context, index) {
                      final problem = problems[index];
                      return _TestProblemPage(
                        problem: problem,
                        answer: _answers[problem.id] ?? '',
                        onAnswerChanged: (value) =>
                            _answers[problem.id] = value,
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _TestToolbar extends StatelessWidget {
  const _TestToolbar({
    required this.title,
    required this.pageIndex,
    required this.pageCount,
    required this.submitting,
    required this.onBack,
    required this.onPrevious,
    required this.onNext,
    required this.onSubmit,
    this.remainingSeconds,
  });

  final String title;
  final int pageIndex;
  final int pageCount;
  final int? remainingSeconds;
  final bool submitting;
  final VoidCallback onBack;
  final VoidCallback onPrevious;
  final VoidCallback onNext;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final isLastMinute = remainingSeconds != null && remainingSeconds! <= 60;
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: AppColors.panel,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: SizedBox(
        height: 72,
        child: Row(
          children: [
            IconButton(
              tooltip: '나가기',
              onPressed: onBack,
              icon: const Icon(Icons.arrow_back_rounded),
            ),
            const SizedBox(width: 4),
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppColors.text,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
            _ToolbarPill(
              color: isLastMinute ? AppColors.danger : AppColors.text,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.timer_outlined, size: 16),
                  const SizedBox(width: 6),
                  Text(
                    remainingSeconds == null
                        ? '제한 없음'
                        : _formatDuration(remainingSeconds!),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            IconButton(
              tooltip: '이전 문항',
              onPressed: pageIndex == 0 ? null : onPrevious,
              icon: const Icon(Icons.chevron_left_rounded),
            ),
            Text(
              '${pageIndex + 1} / $pageCount',
              style: const TextStyle(
                color: AppColors.text,
                fontWeight: FontWeight.w900,
              ),
            ),
            IconButton(
              tooltip: '다음 문항',
              onPressed: pageIndex >= pageCount - 1 ? null : onNext,
              icon: const Icon(Icons.chevron_right_rounded),
            ),
            const SizedBox(width: 8),
            FilledButton.icon(
              onPressed: submitting ? null : onSubmit,
              icon: submitting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.check_rounded),
              label: const Text('제출'),
            ),
            const SizedBox(width: 16),
          ],
        ),
      ),
    );
  }
}

class _ToolbarPill extends StatelessWidget {
  const _ToolbarPill({required this.child, required this.color});

  final Widget child;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(999),
      ),
      child: IconTheme.merge(
        data: const IconThemeData(color: AppColors.panel),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: DefaultTextStyle.merge(
            style: const TextStyle(
              color: AppColors.panel,
              fontWeight: FontWeight.w900,
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

class _TestProblemPage extends StatelessWidget {
  const _TestProblemPage({
    required this.problem,
    required this.answer,
    required this.onAnswerChanged,
  });

  final StudentMaterialProblem problem;
  final String answer;
  final ValueChanged<String> onAnswerChanged;

  @override
  Widget build(BuildContext context) {
    final title = problem.problemNumber?.trim().isNotEmpty == true
        ? '${problem.problemNumber}번'
        : '${problem.pageNumber}번';
    final body = (problem.problemText ?? '').trim();
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 28, 28, 36),
      child: InteractiveViewer(
        minScale: 0.72,
        maxScale: 3.6,
        boundaryMargin: const EdgeInsets.all(220),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1180),
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: AppColors.panel,
                  border: Border.all(color: AppColors.border),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x0D000000),
                      blurRadius: 18,
                      offset: Offset(0, 10),
                    ),
                  ],
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(64, 54, 64, 54),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      DecoratedBox(
                        decoration: BoxDecoration(
                          color: AppColors.text,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                          child: Text(
                            title,
                            style: const TextStyle(
                              color: AppColors.panel,
                              fontSize: 20,
                              height: 1,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 52),
                      Expanded(
                        child: SingleChildScrollView(
                          child: _ProblemMathText(
                            text: body.isEmpty ? '문항 내용이 없습니다.' : body,
                            style: TextStyle(
                              color: body.isEmpty
                                  ? AppColors.muted
                                  : AppColors.text,
                              fontSize: _problemBodyFontSize(body),
                              height: 1.45,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 22),
                      TextFormField(
                        key: ValueKey('answer-${problem.id}'),
                        initialValue: answer,
                        onChanged: onAnswerChanged,
                        minLines: 1,
                        maxLines: 3,
                        decoration: const InputDecoration(
                          labelText: '답안 입력',
                          hintText: '답을 입력하세요.',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  double _problemBodyFontSize(String body) {
    final length = body.runes.length;
    if (length <= 90) return 31;
    if (length <= 160) return 27;
    if (length <= 260) return 23;
    return 20;
  }
}

class _ProblemMathText extends StatelessWidget {
  const _ProblemMathText({required this.text, required this.style});

  final String text;
  final TextStyle style;

  @override
  Widget build(BuildContext context) {
    final spans = <InlineSpan>[];
    for (final segment in _splitMathSegments(text)) {
      if (segment.isMath) {
        spans.add(
          WidgetSpan(
            alignment: PlaceholderAlignment.middle,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 1.5),
              child: Math.tex(
                segment.text,
                mathStyle: segment.display ? MathStyle.display : MathStyle.text,
                textStyle: style,
                onErrorFallback: (_) => Text(
                  segment.raw,
                  style: style.copyWith(fontFamily: 'monospace'),
                ),
              ),
            ),
          ),
        );
      } else {
        spans.add(TextSpan(text: segment.text, style: style));
      }
    }
    return Text.rich(
      TextSpan(children: spans),
      softWrap: true,
      overflow: TextOverflow.visible,
    );
  }
}

class _MathTextSegment {
  const _MathTextSegment.text(this.text)
    : isMath = false,
      display = false,
      raw = text;

  const _MathTextSegment.math({
    required this.text,
    required this.raw,
    required this.display,
  }) : isMath = true;

  final String text;
  final String raw;
  final bool isMath;
  final bool display;
}

List<_MathTextSegment> _splitMathSegments(String value) {
  final segments = <_MathTextSegment>[];
  var cursor = 0;
  while (cursor < value.length) {
    final start = value.indexOf(r'$', cursor);
    if (start < 0) {
      if (cursor < value.length) {
        segments.add(_MathTextSegment.text(value.substring(cursor)));
      }
      break;
    }
    if (start > cursor) {
      segments.add(_MathTextSegment.text(value.substring(cursor, start)));
    }
    final display = start + 1 < value.length && value[start + 1] == r'$';
    final markerLength = display ? 2 : 1;
    final marker = display ? r'$$' : r'$';
    final contentStart = start + markerLength;
    final end = value.indexOf(marker, contentStart);
    if (end < 0) {
      segments.add(_MathTextSegment.text(value.substring(start)));
      break;
    }
    final raw = value.substring(start, end + markerLength);
    final tex = value.substring(contentStart, end).trim();
    if (tex.isEmpty) {
      segments.add(_MathTextSegment.text(raw));
    } else {
      segments.add(
        _MathTextSegment.math(text: tex, raw: raw, display: display),
      );
    }
    cursor = end + markerLength;
  }
  return segments;
}

class _TestMessageScaffold extends StatelessWidget {
  const _TestMessageScaffold({
    required this.title,
    required this.message,
    required this.onBack,
    this.onRetry,
  });

  final String title;
  final String message;
  final VoidCallback onBack;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              IconButton(
                tooltip: '뒤로',
                onPressed: onBack,
                icon: const Icon(Icons.arrow_back_rounded),
              ),
              const Spacer(),
              Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: AppColors.panel,
                      border: Border.all(color: AppColors.border),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            title,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: AppColors.text,
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Text(
                            message,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: AppColors.muted,
                              height: 1.45,
                            ),
                          ),
                          if (onRetry != null) ...[
                            const SizedBox(height: 18),
                            FilledButton(
                              onPressed: onRetry,
                              child: const Text('다시 시도'),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              const Spacer(flex: 2),
            ],
          ),
        ),
      ),
    );
  }
}

String _formatDuration(int seconds) {
  final safe = math.max(0, seconds);
  final minutes = safe ~/ 60;
  final rest = safe % 60;
  return '$minutes:${rest.toString().padLeft(2, '0')}';
}
