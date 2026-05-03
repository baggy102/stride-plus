import { IsMongoId } from 'class-validator';

export class CreatePostDto {
  @IsMongoId()
  runId: string;
}
