import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { promises as fs } from 'fs';
import { basename, extname, join } from 'path';

// 업로드 파일(러닝 사진·경로 이미지) 저장소.
// S3_BUCKET이 있으면 S3(운영), 없으면 서버의 uploads 폴더(로컬 개발).
// 앱에 주는 주소는 어느 쪽이든 '/uploads/<파일명>'으로 같고, S3일 때는 GET /uploads/<파일명>이 서명 URL로 넘긴다.
const SIGNED_URL_SECONDS = 60 * 60;

@Injectable()
export class StorageService {
  private readonly bucket: string | undefined;
  private readonly s3: S3Client | null;
  private readonly localDir = join(process.cwd(), 'uploads');

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET') || undefined;
    this.s3 = this.bucket
      ? new S3Client({
          region: config.get<string>('S3_REGION') ?? 'ap-southeast-2',
          credentials: {
            accessKeyId: config.get<string>('S3_ACCESS_KEY_ID') ?? '',
            secretAccessKey: config.get<string>('S3_SECRET_ACCESS_KEY') ?? '',
          },
        })
      : null;
  }

  get usesS3(): boolean {
    return this.s3 !== null;
  }

  /** 파일을 저장하고 앱에 줄 주소('/uploads/<파일명>')를 돌려준다 */
  async save(file: Express.Multer.File): Promise<string> {
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname).toLowerCase()}`;
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({
        Bucket: this.bucket, Key: name, Body: file.buffer, ContentType: file.mimetype,
      }));
    } else {
      await fs.mkdir(this.localDir, { recursive: true });
      await fs.writeFile(join(this.localDir, name), file.buffer);
    }
    return `/uploads/${name}`;
  }

  /** S3 파일을 잠깐 열어 볼 수 있는 주소. 로컬 저장이면 null */
  async signedUrl(name: string): Promise<string | null> {
    if (!this.s3) return null;
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: basename(name) }), {
      expiresIn: SIGNED_URL_SECONDS,
    });
  }

  // '/uploads/<파일명>'의 파일명만 써서 저장소 밖을 가리키지 못하게 한다.
  // 이미 없는 파일 등 삭제 실패는 호출한 작업(계정 삭제 등)을 막지 않는다.
  async remove(urls: string[]): Promise<void> {
    const names = urls.filter((url) => url.startsWith('/uploads/')).map((url) => basename(url));
    if (names.length === 0) return;
    if (this.s3) {
      await this.s3
        .send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: names.map((Key) => ({ Key })) } }))
        .catch(() => undefined);
      return;
    }
    await Promise.all(names.map((name) => fs.unlink(join(this.localDir, name)).catch(() => undefined)));
  }
}
