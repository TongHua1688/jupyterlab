// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
'use strict';

import * as CodeMirror
  from 'codemirror';

import 'codemirror/mode/meta';

import {
  IKernelId
} from 'jupyter-js-services';

import {
  IChangedArgs
} from 'phosphor-properties';

import {
  ISignal, Signal
} from 'phosphor-signaling';

import {
  Widget
} from 'phosphor-widget';

import {
  loadModeByFileName
} from '../codemirror';

import {
  CodeMirrorWidget
} from '../codemirror/widget';

import {
  IDocumentModel, IWidgetFactory, IDocumentContext
} from './index';


/**
 * The class name added to a dirty widget.
 */
const DIRTY_CLASS = 'jp-mod-dirty';

/**
 * The class name added to a jupyter code mirror widget.
 */
const EDITOR_CLASS = 'jp-CodeMirrorWidget';


/**
 * The default implementation of a document model.
 */
export
class DocumentModel implements IDocumentModel {
  /**
   * Construct a new document model.
   */
  constructor(languagePreference: string) {
    this._defaultLang = languagePreference;
  }

  /**
   * Get whether the model factory has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * A signal emitted when the document content changes.
   */
  get contentChanged(): ISignal<IDocumentModel, void> {
    return Private.contentChangedSignal.bind(this);
  }

  /**
   * A signal emitted when the document state changes.
   */
  get stateChanged(): ISignal<IDocumentModel, IChangedArgs<any>> {
    return Private.stateChangedSignal.bind(this);
  }

  /**
   * The dirty state of the document.
   */
  get dirty(): boolean {
    return this._dirty;
  }
  set dirty(newValue: boolean) {
    if (newValue === this._dirty) {
      return;
    }
    let oldValue = this._dirty;
    this._dirty = newValue;
    this.stateChanged.emit({ name: 'dirty', oldValue, newValue });
  }

  /**
   * The read only state of the document.
   */
  get readOnly(): boolean {
    return this._readOnly;
  }
  set readOnly(newValue: boolean) {
    if (newValue === this._readOnly) {
      return;
    }
    let oldValue = this._readOnly;
    this._readOnly = newValue;
    this.stateChanged.emit({ name: 'readOnly', oldValue, newValue });
  }

  /**
   * The default kernel name of the document.
   *
   * #### Notes
   * This is a read-only property.
   */
  get defaultKernelName(): string {
    return '';
  }

  /**
   * The default kernel language of the document.
   *
   * #### Notes
   * This is a read-only property.
   */
  get defaultKernelLanguage(): string {
    return this._defaultLang;
  }

  /**
   * Dispose of the resources held by the document manager.
   */
  dispose(): void {
    this._isDisposed = true;
  }

  /**
   * Serialize the model to a string.
   */
  toString(): string {
    return this._text;
  }

  /**
   * Deserialize the model from a string.
   *
   * #### Notes
   * Should emit a [contentChanged] signal.
   */
  fromString(value: string): void {
    if (this._text === value) {
      return;
    }
    this._text = value;
    this.contentChanged.emit(void 0);
    this.dirty = true;
  }

  /**
   * Serialize the model to JSON.
   */
  toJSON(): any {
    return JSON.stringify(this._text);
  }

  /**
   * Deserialize the model from JSON.
   *
   * #### Notes
   * Should emit a [contentChanged] signal.
   */
  fromJSON(value: any): void {
    this.fromString(JSON.parse(value));
  }

  /**
   * Initialize the model state.
   */
  initialize(): void {
    // No action necessary.
  }

  private _text = '';
  private _defaultLang = '';
  private _dirty = false;
  private _readOnly = false;
  private _isDisposed = false;
}


/**
 * The default implementation of a model factory.
 */
export
class ModelFactory {
  /**
   * Get whether the model factory has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the document manager.
   */
  dispose(): void {
    this._isDisposed = true;
  }

  /**
   * Create a new model.
   *
   * @param languagePreference - An optional kernel language preference.
   *
   * @returns A new document model.
   */
  createNew(languagePreference?: string): IDocumentModel {
    return new DocumentModel(languagePreference);
  }

  /**
   * Get the preferred kernel language given an extension.
   */
  preferredLanguage(ext: string): string {
    let mode = CodeMirror.findModeByExtension(ext.slice(1));
    if (mode) {
      return mode.mode;
    }
  }

  private _isDisposed = false;
}


/**
 * A document widget for codemirrors.
 */
export
class EditorWidget extends CodeMirrorWidget {
  /**
   * Construct a new editor widget.
   */
  constructor(model: IDocumentModel, context: IDocumentContext) {
    super();
    this.addClass(EDITOR_CLASS);
    let editor = this.editor;
    let doc = editor.getDoc();
    doc.setValue(model.toString());
    this.title.text = context.path.split('/').pop();
    loadModeByFileName(editor, context.path);
    model.stateChanged.connect((m, args) => {
      if (args.name === 'dirty') {
        if (args.newValue) {
          this.title.className += ` ${DIRTY_CLASS}`;
        } else {
          this.title.className = this.title.className.replace(DIRTY_CLASS, '');
        }
      }
    });
    context.pathChanged.connect((c, path) => {
      loadModeByFileName(editor, path);
      this.title.text = path.split('/').pop();
    });
    model.contentChanged.connect(() => {
      let old = doc.getValue();
      let text = model.toString();
      if (old !== text) {
        doc.setValue(text);
      }
    });
    CodeMirror.on(doc, 'change', (instance, change) => {
      if (change.origin !== 'setValue') {
        model.fromString(instance.getValue());
      }
    });
  }
}


/**
 * The default implemetation of a widget factory.
 */
export
class WidgetFactory implements IWidgetFactory<EditorWidget> {
  /**
   * Get whether the model factory has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the document manager.
   */
  dispose(): void {
    this._isDisposed = true;
  }

  /**
   * Create a new widget given a document model and a context.
   */
  createNew(model: IDocumentModel, context: IDocumentContext, kernel?: IKernelId): EditorWidget {
    // TODO: if a kernel id or a name other than 'none' or 'default'
    // was given, start that kernel
    return new EditorWidget(model, context);
  }

  /**
   * Take an action on a widget before closing it.
   *
   * @returns A promise that resolves to true if the document should close
   *   and false otherwise.
   */
  beforeClose(model: IDocumentModel, context: IDocumentContext, widget: Widget): Promise<boolean> {
    // There is nothing specific to do.
    return Promise.resolve(true);
  }

  private _isDisposed = false;
}


/**
 * A private namespace for data.
 */
namespace Private {
  /**
   * A signal emitted when a document content changes.
   */
  export
  const contentChangedSignal = new Signal<IDocumentModel, void>();

  /**
   * A signal emitted when a document dirty state changes.
   */
  export
  const stateChangedSignal = new Signal<IDocumentModel, IChangedArgs<any>>();
}
