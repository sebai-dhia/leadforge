import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18n } from './i18n';

/** Turns the stored area label into something readable: a drawn rectangle is not shown as coordinates. */
@Pipe({ name: 'area', pure: false })
export class AreaPipe implements PipeTransform {
  private readonly t = inject(I18n).t;

  transform(value: string | null | undefined): string {
    if (!value) return '';
    if (/^map area/i.test(value)) return this.t('area.drawn');
    return value.replace(/\s*\|\s*/g, ', ');
  }
}
