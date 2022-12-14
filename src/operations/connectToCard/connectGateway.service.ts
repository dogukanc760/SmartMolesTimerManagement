import { HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SensorCards } from 'src/model/WorkGroup/Sensors/sensorCards.entity';
import { WorkGroup } from 'src/model/WorkGroup/workGroup.entity';
import { GatewayDTO } from 'src/units/gateway/gateway.dto';
import { GatewayService } from 'src/units/gateway/gateway.service';
import { GatewayLogsService } from 'src/units/gateway/gatewayLogs/gatewayLogs.service';
import { SensorCalibrationLogsService } from 'src/units/workGroup/sensors/sensorCalibrationLogs/sensorCalibrationLog.service';
import { SensorCardLogsService } from 'src/units/workGroup/sensors/sensorCardLogs/sensorCardLogs.service';
import { SensorCardParamsService } from 'src/units/workGroup/sensors/sensorCardParams/sensorCardParams.service';
import { SensorCardsDTO } from 'src/units/workGroup/sensors/sensorCards/sensorCards.dto';
import { SensorCardsService } from 'src/units/workGroup/sensors/sensorCards/sensorCards.service';
import { SensorMoistureLogService } from 'src/units/workGroup/sensors/sensorMoistureLogs/sensorMoistureLog.service';
import { WorkGroupDTO } from 'src/units/workGroup/workGroup/workGroup.dto';
import { WorkGroupService } from 'src/units/workGroup/workGroup/workGroup.service';
import { Repository } from 'typeorm';

@Injectable()
export class ConnectGatewayService {
  constructor(
    private readonly gatewayService: GatewayService,
    private readonly gatewayLogService: GatewayLogsService,
    private readonly sensorCardService: SensorCardsService,
    private readonly workGroupService: WorkGroupService,
    private readonly sensorMoistureLogService: SensorMoistureLogService,
    private readonly sensorCalibrationLogService: SensorCalibrationLogsService,
    private readonly sensorCardParamsService: SensorCardParamsService,
    private readonly sensorLogService: SensorCardLogsService,
  ) {}

  // GATEWAYLERE BAĞLANIRKEN WORKER VEYA CONNECTTOGATEWAYANDPROCESS İÇERİSİNDE FONKSİYONLARI BİRBİRİNE BAĞLA!

  public async Worker() {
    // Gateway bağlantı adımı
    await this.connectToGatewayAndProcess();
  }

  public async process(processNumber: Number) {
    switch (processNumber) {
      case 1:
        this.connectToGatewayAndProcess();
        break;

      default:
        break;
    }
  }

  public async connectToGatewayAndProcess() {
    try {
      const gateways = await this.gatewayService.getAll();

      gateways.forEach(async (element) => {
        //connect to gateway for each a element on this lines
        this.readDateAndTime(
          element.contentId,
          element.ServerIP,
          element.ServerPort,
          element,
        );
        this.readMoisture(
          element.contentId,
          element.ServerIP,
          element.ServerPort,
          element,
        );
      });
    } catch (error) {
      return false;
    }
  }

  public async readDateAndTime(
    contentId: string,
    serverIP: string,
    port: string,
    gateways: GatewayDTO,
  ) {
    try {
      //get request for date and time by gateway
      //after go typeorm and update target gateways 'updatedAt' property
      // okunan tarih updatedAt, huba gönderilen tarih lastChangedAt ' e yazılır
      // şuan karta bağlı olmadığımız için şuanın tarihini yazıyoruz.
      gateways.updatedAt = new Date();
      const updated = await this.gatewayService.update(contentId, gateways);
      if (updated) {
        this.gatewayLogService.create({
          GatewayID: contentId,
          LogContent: `${contentId}'li ${gateways.Name}'li Gateway Tarih Saat Okuma İşlemi Başarılı!`,
          LogDescription: `${gateways.Name} Bağlantı Sağlandı ve Tarih Saat Okundu`,
          LogTitle: `${gateways.Name} Rutin İşlemler`,
          LogStatus: 'Success',
          contentId: '',
          createdAt: new Date(),
          isDeleted: false,
          lastChangedDateTime: new Date(),
          updatedAt: new Date(),
        });
        return true;
      }
      this.gatewayLogService.create({
        GatewayID: contentId,
        LogContent: `${contentId}'li ${gateways.Name}'li Gateway Tarih Saat Okuma İşlemi Başarısız!`,
        LogDescription: `${gateways.Name} Tarih ve Saat Okuma İşlemi Başarısız.`,
        LogTitle: `${gateways.Name} Rutin İşlemler`,
        LogStatus: 'Failed',
        contentId: '',
        createdAt: new Date(),
        isDeleted: false,
        lastChangedDateTime: new Date(),
        updatedAt: new Date(),
      });
      return false;
    } catch (error) {
      this.gatewayLogService.create({
        GatewayID: contentId,
        LogContent: `${contentId}'li ${gateways.Name}'li Gateway Tarih Saat Okuma İşlemi Başarısız!`,
        LogDescription: `${gateways.Name} Gateway hata içeriği => ${error}`,
        LogTitle: `${gateways.Name} Rutin İşlemler`,
        LogStatus: 'Failed',
        contentId: '',
        createdAt: new Date(),
        isDeleted: false,
        lastChangedDateTime: new Date(),
        updatedAt: new Date(),
      });
      return false;
    }
  }

  public async readMoisture(
    contentId: string,
    serverIP: string,
    port: string,
    gateways: GatewayDTO,
  ) {
    //get request for sensor moisture by gateway
    let workGroups = Array<WorkGroupDTO>();
    var sensorCards = Array<SensorCardsDTO>();
    workGroups = await this.workGroupService.getByGateway(contentId);
    workGroups.forEach(async (element) => {
      sensorCards = await this.sensorCardService.getByWorkGroup(
        element.contentId,
      );
      sensorCards.forEach(async (sensorCard) => {
        const sensorCardParams =
          await this.sensorCardParamsService.getBySensorCard(
            sensorCard.contentId,
          );
        if (sensorCardParams[0].ManagementType === 'MANUEL') {
          try {
            //get request for data
            //dönen her bir sensör ile, herbir sensör nem verisini ilgili yerlere yaz
            // daha sonra dönen veriye göre ortalama alıp moisture log tablosuna yaz
            // BURASI SADECE NEM OKUMA İŞLEMİ İÇİNDİR. KALİBRASYON ZAMANI CALİBRATİON LOG TABLOSUNA YAZILIR!!!!!!!!!
            // SENSORDATAS VE SENSORS PROPERTYLERİNE VERİ YAZILDIKTAN SONRA (KALIBRASYON SEKLINE GORE ORTALAMA ALINDIKTAN SONRA)
            // SENSOR LOG ENTİTYSİNE LOGBASE ENTİTY İ ENJTEKE ET
            const create = this.sensorMoistureLogService.create({
              ContentId: '',
              createdAt: new Date(),
              GetDataAt: new Date(),
              isDeleted: false,
              lastChangedDateTime: new Date(),
              SensorCardID: sensorCard.contentId,
              SensorDatas: [''],
              Sensors: [''],
              SensorDatasAverage: '', // Bütün sensörlerin ortalaması,
              updatedAt: new Date(),
            });
            if (create) {
              this.sensorLogService.create({
                SensorCardID: contentId,
                contentId: '',
                LogContent: `${gateways.contentId}'li ${gateways.Name}'li Gateway'e ait ${sensorCard.Name} isimli sensörden nem verisi başarıyla okundu!`,
                LogDescription: `${gateways.contentId}'li ${gateways.Name}'li Gateway'e ait ${sensorCard.Name} isimli sensörde nem okundu`,
                LogTitle: `${gateways.Name} Rutin İşlemler`,
                LogStatus: 'Success',
                createdAt: new Date(),
                isDeleted: false,
                lastChangedDateTime: new Date(),
                updatedAt: new Date(),
              });
              return true;
            }
            this.sensorLogService.create({
              SensorCardID: contentId,
              contentId: '',
              LogContent: `${gateways.contentId}'li ${gateways.Name}'li Gateway'e ait ${sensorCard.Name} isimli sensörden nem verisi başarısız!`,
              LogDescription: `${gateways.contentId}'li ${gateways.Name}'li Gateway'e ait ${sensorCard.Name} isimli sensörde nem okunamadı`,
              LogTitle: `${gateways.Name} Rutin İşlemler`,
              LogStatus: 'Failed',
              createdAt: new Date(),
              isDeleted: false,
              lastChangedDateTime: new Date(),
              updatedAt: new Date(),
            });
            return false;
          } catch (error) {
            this.sensorLogService.create({
              SensorCardID: contentId,
              contentId: '',
              LogContent: `${gateways.contentId}'li ${gateways.Name}'li Gateway'e ait ${sensorCard.Name} isimli sensörden nem verisi başarısız!`,
              LogDescription: ` ${sensorCard.Name} isimli sensörde nem okunamadı hata=> ${error}`,
              LogTitle: `${gateways.Name} Rutin İşlemler`,
              LogStatus: 'Failed',
              createdAt: new Date(),
              isDeleted: false,
              lastChangedDateTime: new Date(),
              updatedAt: new Date(),
            });
            return false;
          }
        }
        this.sensorLogService.create({
          SensorCardID: contentId,
          contentId: '',
          LogContent: `${gateways.contentId}'li ${gateways.Name}'li Gateway'e ait ${sensorCard.Name} isimli sensör manuel yönetime göre değil!`,
          LogDescription: ` ${sensorCard.Name} isimli sensör manuel yönetime göre değil!`,
          LogTitle: `${gateways.Name} Rutin İşlemler`,
          LogStatus: 'Failed',
          createdAt: new Date(),
          isDeleted: false,
          lastChangedDateTime: new Date(),
          updatedAt: new Date(),
        });
        return false;
      });
    });
  }

  public async sendData(
    contentId: string,
    serverIP: string,
    port: string,
    command: string,
  ) {
    try {
      // SERVER IP VE PORTU BELLİ OLAN GATEWAY'E KOMUTU GÖNDER,
      // DURUMA GÖRE DÖNÜŞÜ SAĞLA
      return true;
    } catch (error) {
      return false;
    }
  }

  public async recieveData() {}
}
