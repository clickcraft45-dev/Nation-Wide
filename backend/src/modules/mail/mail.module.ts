import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { AdminMailController } from './admin-mail.controller';

// Global: password reset, partner applications and the admin compose screen all send mail from
// unrelated modules, and threading a MailModule import through each of them adds nothing.
@Global()
@Module({
  controllers: [AdminMailController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
