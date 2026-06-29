import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app/theme.dart';
import '../core/app_config.dart';
import '../core/api_client.dart';
import '../state/student_app_state.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;
  bool _obscurePassword = true;
  bool _remember = true;

  @override
  void dispose() {
    _identifierController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final identifier = _identifierController.text.trim();
    final password = _passwordController.text;
    if (identifier.length < 3 || password.isEmpty) {
      _showMessage('아이디와 비밀번호를 입력해 주세요.');
      return;
    }

    setState(() => _loading = true);
    try {
      await context.read<StudentAppState>().login(
        identifier,
        password,
        remember: _remember,
      );
      if (mounted) {
        final redirect = _safeRedirectTarget(
          GoRouterState.of(context).uri.queryParameters['redirect'],
        );
        context.go(redirect ?? '/notes');
      }
    } catch (error) {
      if (!mounted) return;
      final message = error is ApiException
          ? error.displayMessage
          : '로그인에 실패했습니다. 계정 정보를 확인해 주세요.';
      _showMessage(message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String? _safeRedirectTarget(String? value) {
    if (value == null || value.isEmpty) return null;
    if (!value.startsWith('/') || value.startsWith('//')) return null;
    if (value.startsWith('/login') || value.startsWith('/loading')) return null;
    return value;
  }

  Future<void> _openKakaoLogin() {
    return _openWebUrl(
      _buildUri(apiBaseUrl, '/api/auth/kakao', {'mode': 'login'}),
    );
  }

  Future<void> _openRegister() {
    return _openWebUrl(_buildUri(frontendBaseUrl, '/register'));
  }

  Uri _buildUri(
    String baseUrl,
    String path, [
    Map<String, String>? queryParameters,
  ]) {
    final base = Uri.parse(baseUrl);
    final basePath = base.path.endsWith('/')
        ? base.path.substring(0, base.path.length - 1)
        : base.path;
    return base.replace(
      path: '$basePath$path',
      queryParameters: queryParameters,
    );
  }

  Future<void> _openWebUrl(Uri uri) async {
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      _showMessage('브라우저를 열 수 없습니다.');
    }
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 430),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: AppColors.panel,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: AppColors.border),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x14000000),
                      blurRadius: 28,
                      offset: Offset(0, 18),
                    ),
                  ],
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(28, 30, 28, 26),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const _LogoMark(),
                      const SizedBox(height: 30),
                      _AuthTextField(
                        controller: _identifierController,
                        hintText: 'ID',
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        enabled: !_loading,
                      ),
                      const SizedBox(height: 14),
                      _AuthTextField(
                        controller: _passwordController,
                        hintText: 'PASSWORD',
                        obscureText: _obscurePassword,
                        textInputAction: TextInputAction.done,
                        enabled: !_loading,
                        onSubmitted: (_) => _loading ? null : _submit(),
                        suffix: IconButton(
                          tooltip: _obscurePassword ? '비밀번호 표시' : '비밀번호 숨기기',
                          onPressed: _loading
                              ? null
                              : () => setState(
                                  () => _obscurePassword = !_obscurePassword,
                                ),
                          icon: Icon(
                            _obscurePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                            color: AppColors.muted,
                            size: 20,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(8),
                          onTap: _loading
                              ? null
                              : () => setState(() => _remember = !_remember),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Checkbox(
                                  value: _remember,
                                  onChanged: _loading
                                      ? null
                                      : (value) => setState(
                                          () => _remember = value ?? true,
                                        ),
                                  visualDensity: VisualDensity.compact,
                                  materialTapTargetSize:
                                      MaterialTapTargetSize.shrinkWrap,
                                ),
                                const SizedBox(width: 8),
                                const Text(
                                  '로그인 상태 유지',
                                  style: TextStyle(
                                    color: AppColors.muted,
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),
                      FilledButton(
                        onPressed: _loading ? null : _submit,
                        style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(50),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(999),
                          ),
                        ),
                        child: Text(_loading ? '처리 중...' : '로그인'),
                      ),
                      const _DividerText(),
                      _SocialButton(
                        backgroundColor: const Color(0xFFFEE500),
                        foregroundColor: AppColors.text,
                        label: '카카오로 로그인',
                        onPressed: _openKakaoLogin,
                        child: const Icon(Icons.chat_bubble, size: 24),
                      ),
                      const SizedBox(height: 22),
                      Wrap(
                        alignment: WrapAlignment.center,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          const Text(
                            '계정이 없으신가요? ',
                            style: TextStyle(
                              color: AppColors.muted,
                              fontSize: 14,
                            ),
                          ),
                          InkWell(
                            borderRadius: BorderRadius.circular(6),
                            onTap: _openRegister,
                            child: const Padding(
                              padding: EdgeInsets.symmetric(
                                horizontal: 2,
                                vertical: 4,
                              ),
                              child: Text(
                                '회원가입',
                                style: TextStyle(
                                  color: AppColors.text,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                          ),
                        ],
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
}

class _LogoMark extends StatelessWidget {
  const _LogoMark();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 70,
      height: 70,
      child: Padding(
        padding: const EdgeInsets.all(9),
        child: Image.asset(
          'assets/tena-integrated-login-mark-dark.png',
          fit: BoxFit.contain,
        ),
      ),
    );
  }
}

class _AuthTextField extends StatelessWidget {
  const _AuthTextField({
    required this.controller,
    required this.hintText,
    this.keyboardType,
    this.textInputAction,
    this.obscureText = false,
    this.enabled = true,
    this.onSubmitted,
    this.suffix,
  });

  final TextEditingController controller;
  final String hintText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final bool obscureText;
  final bool enabled;
  final ValueChanged<String>? onSubmitted;
  final Widget? suffix;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      obscureText: obscureText,
      enabled: enabled,
      onSubmitted: onSubmitted,
      style: const TextStyle(
        color: AppColors.text,
        fontWeight: FontWeight.w700,
      ),
      decoration: InputDecoration(
        hintText: hintText,
        suffixIcon: suffix,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 18,
          vertical: 15,
        ),
        filled: true,
        fillColor: AppColors.panelSoft,
        hintStyle: const TextStyle(
          color: AppColors.subtle,
          fontWeight: FontWeight.w800,
          letterSpacing: 0,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(999),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        disabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(999),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(999),
          borderSide: const BorderSide(color: AppColors.text, width: 1.4),
        ),
      ),
    );
  }
}

class _DividerText extends StatelessWidget {
  const _DividerText();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 22),
      child: Row(
        children: [
          Expanded(child: Container(height: 1, color: AppColors.border)),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 12),
            child: Text(
              '또는',
              style: TextStyle(
                color: AppColors.subtle,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Expanded(child: Container(height: 1, color: AppColors.border)),
        ],
      ),
    );
  }
}

class _SocialButton extends StatelessWidget {
  const _SocialButton({
    required this.backgroundColor,
    required this.foregroundColor,
    required this.label,
    required this.child,
    required this.onPressed,
  });

  final Color backgroundColor;
  final Color foregroundColor;
  final String label;
  final Widget child;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: label,
      child: Semantics(
        button: true,
        label: label,
        child: Material(
          color: backgroundColor,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onPressed,
            child: SizedBox.square(
              dimension: 56,
              child: IconTheme(
                data: IconThemeData(color: foregroundColor),
                child: Center(child: child),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
