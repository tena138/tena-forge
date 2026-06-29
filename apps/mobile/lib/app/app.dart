import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

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
  late final _router = buildRouter(context.read<StudentAppState>());

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
      theme: buildTenaTheme(),
      routerConfig: _router,
    );
  }
}
