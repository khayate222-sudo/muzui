import {areas as sourceAreas} from '../shared/model';
import {t} from './i18n';
export * from '../shared/model';
export const areas=sourceAreas.map(area=>({...area,get label(){return t(area.label);}}));
