import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app/app.dart';
import 'core/api_client.dart';
import 'core/session_store.dart';
import 'data/student_repository.dart';
import 'state/student_app_state.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000',
  );

  final sessionStore = SecureSessionStore();
  final apiClient = ApiClient(baseUrl: apiBaseUrl, sessionStore: sessionStore);
  final repository = StudentRepository(apiClient: apiClient, sessionStore: sessionStore);

  runApp(
    ChangeNotifierProvider(
      create: (_) => StudentAppState(repository)..bootstrap(),
      child: const TenaForgeStudentApp(),
    ),
  );
}

