import 'package:flutter/material.dart';

enum NoteItemType { folder, notebook, pdf }

enum NoteSortMode { date, name, type }

enum NoteTool {
  pen,
  eraser,
  highlighter,
  textExtractor,
  lasso,
  image,
  text,
  pointer,
}

class NoteLibraryItem {
  const NoteLibraryItem({
    required this.id,
    required this.name,
    required this.type,
    required this.updatedAt,
    required this.favorite,
    required this.shared,
    required this.documentCount,
    required this.color,
    this.parentFolderId,
    this.academyId,
    this.materialId,
  });

  final String id;
  final String name;
  final NoteItemType type;
  final DateTime updatedAt;
  final bool favorite;
  final bool shared;
  final int documentCount;
  final Color color;
  final String? parentFolderId;
  final String? academyId;
  final String? materialId;

  String get typeLabel {
    switch (type) {
      case NoteItemType.folder:
        return 'Folder';
      case NoteItemType.notebook:
        return 'Notebook';
      case NoteItemType.pdf:
        return 'PDF';
    }
  }

  NoteLibraryItem copyWith({
    String? name,
    NoteItemType? type,
    DateTime? updatedAt,
    bool? favorite,
    bool? shared,
    int? documentCount,
    Color? color,
    String? parentFolderId,
    String? academyId,
    String? materialId,
  }) {
    return NoteLibraryItem(
      id: id,
      name: name ?? this.name,
      type: type ?? this.type,
      updatedAt: updatedAt ?? this.updatedAt,
      favorite: favorite ?? this.favorite,
      shared: shared ?? this.shared,
      documentCount: documentCount ?? this.documentCount,
      color: color ?? this.color,
      parentFolderId: parentFolderId ?? this.parentFolderId,
      academyId: academyId ?? this.academyId,
      materialId: materialId ?? this.materialId,
    );
  }
}

class NoteDocument {
  const NoteDocument({
    required this.id,
    required this.title,
    required this.folderId,
    required this.updatedAt,
    required this.favorite,
  });

  final String id;
  final String title;
  final String folderId;
  final DateTime updatedAt;
  final bool favorite;

  NoteDocument copyWith({
    String? title,
    String? folderId,
    DateTime? updatedAt,
    bool? favorite,
  }) {
    return NoteDocument(
      id: id,
      title: title ?? this.title,
      folderId: folderId ?? this.folderId,
      updatedAt: updatedAt ?? this.updatedAt,
      favorite: favorite ?? this.favorite,
    );
  }
}

class NoteStroke {
  const NoteStroke({
    required this.points,
    required this.color,
    required this.width,
    this.isHighlighter = false,
    this.text,
  });

  final List<Offset> points;
  final Color color;
  final double width;
  final bool isHighlighter;
  final String? text;
}
