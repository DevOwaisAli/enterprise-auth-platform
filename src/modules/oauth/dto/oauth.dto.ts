import { ApiProperty } from '@nestjs/swagger';
import { OAuthProvider } from '@prisma/client';

export class OAuthAccountDto {
  @ApiProperty({ enum: OAuthProvider })
  provider!: OAuthProvider;

  @ApiProperty({ required: false, nullable: true })
  email!: string | null;

  @ApiProperty()
  linkedAt!: Date;
}

export class OAuthLoginResultDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  isNewUser!: boolean;
}
