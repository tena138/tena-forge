import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../screens/add_wrong_answer_screen.dart';
import '../screens/academies_screen.dart';
import '../screens/assignment_detail_screen.dart';
import '../screens/assignments_screen.dart';
import '../screens/calendar_screen.dart';
import '../screens/login_screen.dart';
import '../screens/note_editor_screen.dart';
import '../screens/notes_documents_screen.dart';
import '../screens/notes_shell_screen.dart';
import '../screens/profile_screen.dart';
import '../screens/student_invite_screen.dart';
import '../screens/test_screen.dart';
import '../screens/wrong_answers_screen.dart';
import '../state/student_app_state.dart';

GoRouter buildRouter(StudentAppState appState) {
  return GoRouter(
    initialLocation: '/',
    refreshListenable: appState,
    redirect: (context, state) {
      final location = state.uri.path;
      final loggingIn = location == '/login';
      final loadingSession = location == '/loading';
      final redirectTarget = _safeRedirectTarget(
        state.uri.queryParameters['redirect'],
      );
      final intendedLocation = redirectTarget ?? state.uri.toString();

      if (!appState.bootstrapped) {
        if (loadingSession) return null;
        return '/loading?redirect=${Uri.encodeComponent(intendedLocation)}';
      }
      if (!appState.isAuthenticated) {
        if (loggingIn) return null;
        return '/login?redirect=${Uri.encodeComponent(intendedLocation)}';
      }
      if (loggingIn || loadingSession || location == '/') {
        return redirectTarget ?? '/notes';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/', redirect: (context, state) => '/notes'),
      GoRoute(path: '/study', redirect: (context, state) => '/calendar'),
      GoRoute(path: '/features', redirect: (context, state) => '/calendar'),
      GoRoute(
        path: '/loading',
        builder: (context, state) => const AuthLoadingScreen(),
      ),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(
        path: '/invite/:token',
        builder: (context, state) =>
            StudentInviteScreen(token: state.pathParameters['token']!),
      ),
      GoRoute(
        path: '/academies',
        builder: (context, state) => const AcademiesScreen(),
      ),
      GoRoute(
        path: '/assignment/:id',
        builder: (context, state) =>
            AssignmentDetailScreen(id: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/test/:id',
        builder: (context, state) =>
            TestScreen(assignmentId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/add-wrong-answer',
        builder: (context, state) => const AddWrongAnswerScreen(),
      ),
      GoRoute(
        path: '/profile',
        builder: (context, state) => const ProfileScreen(),
      ),
      GoRoute(
        path: '/assignments',
        builder: (context, state) => const AssignmentsScreen(),
      ),
      GoRoute(
        path: '/wrong-answers',
        builder: (context, state) => const WrongAnswersScreen(),
      ),
      GoRoute(
        path: '/notes/editor/:id',
        builder: (context, state) =>
            NoteEditorScreen(documentId: state.pathParameters['id']!),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            NotesShellScreen(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/calendar',
                builder: (context, state) => const CalendarScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/notes',
                builder: (context, state) => const NotesDocumentsScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

String? _safeRedirectTarget(String? value) {
  if (value == null || value.isEmpty) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.startsWith('/login') || value.startsWith('/loading')) return null;
  return value;
}

class AuthLoadingScreen extends StatelessWidget {
  const AuthLoadingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
