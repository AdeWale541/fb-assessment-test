import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { TransfersModule } from "./transfers/transfers.module";
import { WalletsModule } from "./wallets/wallets.module";

@Module({
  imports: [WalletsModule, TransfersModule],
  controllers: [AppController],
})
export class AppModule {}
