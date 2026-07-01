import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/app_config.dart';
import '../state/note_library_state.dart';
import '../state/student_app_state.dart';
import 'router.dart';
import 'theme.dart';

class TenaForgeStudentApp extends StatefulWidget {
  const TenaForgeStudentApp({super.key});

  @override
  State<TenaForgeStudentApp> createState() => _TenaForgeStudentAppState();
}

class _TenaForgeStudentAppState extends State<TenaForgeStudentApp> {
  final _appLinks = AppLinks();
  StreamSubscription<Uri>? _linkSubscription;
  final Set<String> _handledOauthLinks = {};
  final _scaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();
  late final _router = buildRouter(context.read<StudentAppState>());

  @override
  void initState() {
    super.initState();
    _initAppLinks();
  }

  @override
  void dispose() {
    _linkSubscription?.cancel();
    super.dispose();
  }

  Future<void> _initAppLinks() async {
    _linkSubscription = _appLinks.uriLinkStream.listen(_handleIncomingLink);
    try {
      final initialLink = await _appLinks.getInitialLink();
      if (initialLink != null) {
        await _handleIncomingLink(initialLink);
      }
    } catch (_) {
      // OAuth deep links are optional during startup; login still works by ID.
    }
  }

  Future<void> _handleIncomingLink(Uri uri) async {
    if (!_isOAuthCallback(uri)) return;
    final linkKey = uri.toString();
    if (!_handledOauthLinks.add(linkKey)) return;

    final params = _linkParameters(uri);
    final error = params['oauth_error'];
    if (error != null && error.isNotEmpty) {
      _showOAuthMessage('카카오 로그인을 완료하지 못했습니다. 다시 시도해 주세요.');
      return;
    }

    final accessToken = params['access_token'];
    if (accessToken == null || accessToken.isEmpty) {
      _showOAuthMessage('카카오 로그인 응답이 올바르지 않습니다.');
      return;
    }

    try {
      final appState = context.read<StudentAppState>();
      await _waitForBootstrap(appState);
      await appState.completeOAuthLogin(
        accessToken: accessToken,
        refreshToken: params['refresh_token'],
      );
      if (!mounted) return;
      _router.go(_safeRedirectTarget(params['redirect']) ?? '/notes');
    } catch (_) {
      if (!mounted) return;
      _showOAuthMessage('카카오 로그인 후 앱 세션을 만들지 못했습니다.');
    }
  }

  Future<void> _waitForBootstrap(StudentAppState appState) async {
    for (var attempt = 0; attempt < 100; attempt += 1) {
      if (appState.bootstrapped) return;
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
  }

  bool _isOAuthCallback(Uri uri) {
    final expected = Uri.parse(mobileOAuthRedirectUri);
    return uri.scheme == expected.scheme &&
        uri.host == expected.host &&
        uri.path == expected.path;
  }

  Map<String, String> _linkParameters(Uri uri) {
    final params = <String, String>{...uri.queryParameters};
    if (uri.fragment.isNotEmpty) {
      params.addAll(Uri.splitQueryString(uri.fragment));
    }
    return params;
  }

  String? _safeRedirectTarget(String? value) {
    if (value == null || value.isEmpty) return null;
    if (!value.startsWith('/') || value.startsWith('//')) return null;
    if (value.startsWith('/login') || value.startsWith('/loading')) return null;
    return value;
  }

  void _showOAuthMessage(String message) {
    if (!mounted) return;
    _scaffoldMessengerKey.currentState?.showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<StudentAppState>();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<NoteLibraryState>().syncAcademyMaterials(
        academies: appState.academies,
        materials: appState.materials,
      );
    });

    return MaterialApp.router(
      title: 'Tena Note',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: _scaffoldMessengerKey,
      theme: buildTenaTheme(),
      routerConfig: _router,
    );
  }
}
