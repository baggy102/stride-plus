import { IsIn, IsMongoId } from 'class-validator';
import { REPORT_REASONS, REPORT_TARGET_TYPES } from '../reports.schema';

export class CreateReportDto {
  @IsIn(REPORT_TARGET_TYPES)
  targetType: (typeof REPORT_TARGET_TYPES)[number];

  @IsMongoId()
  targetId: string;

  @IsIn(REPORT_REASONS)
  reason: (typeof REPORT_REASONS)[number];
}
