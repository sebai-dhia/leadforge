import { Pipe, PipeTransform } from '@angular/core';

/** Turns the stored area label into something readable: a drawn rectangle is not shown as coordinates. */
@Pipe({ name: 'area' })
export class AreaPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    if (/^map area/i.test(value)) return 'Drawn map area';
    return value.replace(/\s*\|\s*/g, ', ');
  }
}
