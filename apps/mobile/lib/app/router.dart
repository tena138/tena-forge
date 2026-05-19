import 'package:go_router/go_router.dart';

import '../screens/add_pdf_screen.dart';
import '../screens/add_wrong_answer_screen.dart';
import '../screens/academies_screen.dart';
import '../screens/assignment_detail_screen.dart';
import '../screens/assignments_screen.dart';
import '../screens/calendar_screen.dart';
import '../screens/dashboard_screen.dart';
import '../screens/login_screen.dart';
import '../screens/materials_screen.dart';
import '../screens/profile_screen.dart';
import '../screens/quota_screen.dart';
import '../screens/register_academy_key_screen.dart';
import '../screens/shell_screen.dart';
import '../screens/test_screen.dart';
import '../screens/wrong_answers_screen.dart';
import '../state/student_app_state.dart';

GoRouter buildRouter(StudentAppState appState) {
  return GoRouter(
    initialLocation: '/',
    refreshListenable: appState,
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/register-academy-key', builder: (context, state) => const RegisterAcademyKeyScreen()),
      GoRoute(path: '/academies', builder: (context, state) => const AcademiesScreen()),
      GoRoute(path: '/assignment/:id', builder: (context, state) => AssignmentDetailScreen(id: state.pathParameters['id']!)),
      GoRoute(path: '/test/:id', builder: (context, state) => TestScreen(assignmentId: state.pathParameters['id']!)),
      GoRoute(path: '/add-wrong-answer', builder: (context, state) => const AddWrongAnswerScreen()),
      GoRoute(path: '/add-pdf', builder: (context, state) => const AddPdfScreen()),
      GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => ShellScreen(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/', builder: (context, state) => const DashboardScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/assignments', builder: (context, state) => const AssignmentsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/calendar', builder: (context, state) => const CalendarScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/wrong-answers', builder: (context, state) => const WrongAnswersScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/materials', builder: (context, state) => const MaterialsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/quota', builder: (context, state) => const QuotaScreen())]),
        ],
      ),
    ],
  );
}
