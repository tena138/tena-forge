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

enum NoteEraserMode { precision, standard, stroke }

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
    this.assignmentId,
    this.assignmentType,
    this.assignmentStatus,
    this.assignmentSubmittedAt,
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
  final String? assignmentId;
  final String? assignmentType;
  final String? assignmentStatus;
  final DateTime? assignmentSubmittedAt;

  bool get isAssignmentSubmitted =>
      assignmentSubmittedAt != null ||
      assignmentStatus == 'submitted' ||
      assignmentStatus == 'late' ||
      assignmentStatus == 'completed';

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
    String? assignmentId,
    String? assignmentType,
    String? assignmentStatus,
    DateTime? assignmentSubmittedAt,
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
      assignmentId: assignmentId ?? this.assignmentId,
      assignmentType: assignmentType ?? this.assignmentType,
      assignmentStatus: assignmentStatus ?? this.assignmentStatus,
      assignmentSubmittedAt:
          assignmentSubmittedAt ?? this.assignmentSubmittedAt,
    );
  }
}

class PrintedNotePage {
  const PrintedNotePage({
    required this.problemId,
    required this.pageNumber,
    required this.title,
    this.body,
    this.sourceLabel,
    this.visualUrl,
    this.tags = const [],
  });

  final String problemId;
  final int pageNumber;
  final String title;
  final String? body;
  final String? sourceLabel;
  final String? visualUrl;
  final List<String> tags;

  bool sameContentAs(PrintedNotePage other) {
    if (problemId != other.problemId ||
        pageNumber != other.pageNumber ||
        title != other.title ||
        body != other.body ||
        sourceLabel != other.sourceLabel ||
        visualUrl != other.visualUrl ||
        tags.length != other.tags.length) {
      return false;
    }
    for (var index = 0; index < tags.length; index += 1) {
      if (tags[index] != other.tags[index]) return false;
    }
    return true;
  }
}

class NoteDocument {
  const NoteDocument({
    required this.id,
    required this.title,
    required this.folderId,
    required this.updatedAt,
    required this.favorite,
    this.printedPages = const [],
    this.pageRefs = const [],
  });

  final String id;
  final String title;
  final String folderId;
  final DateTime updatedAt;
  final bool favorite;
  final List<PrintedNotePage> printedPages;
  final List<String> pageRefs;

  NoteDocument copyWith({
    String? title,
    String? folderId,
    DateTime? updatedAt,
    bool? favorite,
    List<PrintedNotePage>? printedPages,
    List<String>? pageRefs,
  }) {
    return NoteDocument(
      id: id,
      title: title ?? this.title,
      folderId: folderId ?? this.folderId,
      updatedAt: updatedAt ?? this.updatedAt,
      favorite: favorite ?? this.favorite,
      printedPages: printedPages ?? this.printedPages,
      pageRefs: pageRefs ?? this.pageRefs,
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
    this.imageData,
    this.imageMimeType,
    this.imageWidth,
    this.imageHeight,
  });

  final List<Offset> points;
  final Color color;
  final double width;
  final bool isHighlighter;
  final String? text;
  final String? imageData;
  final String? imageMimeType;
  final double? imageWidth;
  final double? imageHeight;

  bool get isImage => imageData != null && imageData!.isNotEmpty;

  NoteStroke copyWith({List<Offset>? points}) {
    return NoteStroke(
      points: points ?? this.points,
      color: color,
      width: width,
      isHighlighter: isHighlighter,
      text: text,
      imageData: imageData,
      imageMimeType: imageMimeType,
      imageWidth: imageWidth,
      imageHeight: imageHeight,
    );
  }
}
