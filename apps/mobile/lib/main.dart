import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app/app.dart';
import 'core/app_config.dart';
import 'core/api_client.dart';
import 'core/session_store.dart';
import 'data/student_repository.dart';
import 'state/note_library_state.dart';
import 'state/student_app_state.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  final sessionStore = createSessionStore();
  final apiClient = ApiClient(baseUrl: apiBaseUrl, sessionStore: sessionStore);
  final repository = StudentRepository(
    apiClient: apiClient,
    sessionStore: sessionStore,
  );

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(
          create: (_) => StudentAppState(repository)..bootstrap(),
        ),
        ChangeNotifierProvider(create: (_) => NoteLibraryState()),
      ],
      child: const TenaForgeStudentApp(),
    ),
  );
}
