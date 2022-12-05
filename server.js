const express = require('express');
const bodyParser = require('body-parser');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');
const multer = require('multer');
const { sign, verify } = require('jsonwebtoken');
const { hash, compare } = require('bcrypt');
const upload = multer({ dest: './public/upload/' });
const Sequelize = require('sequelize');
const { Op } = require("sequelize");

const APP_NAME = 'KupiSlona';
const JWT_SALT = 'JwT_SaLt82&';
const PORT = 4000;

// mariaDB:
// user: "mv"
// password: "MyNewPass5!"

// elena33
// 123

//////////////////////////////////////////////////////////////////
function jwtCheck(req){
  if (req.headers.authorization){
      const token = req.headers.authorization.slice(7)
      try {
          return verify(token, JWT_SALT)
      }
      catch(e){
        console.log("ERROR: ", e);
      }
  }
}

// const { now } = require('sequelize/types/utils');
const sequelize = new Sequelize('mysql://mv:MyNewPass5!@127.0.0.1/slon');


const getModels = userId => {

  const sequelize = new Sequelize('mysql://mv:MyNewPass5!@127.0.0.1/slon');

  class Ad extends Sequelize.Model {
    get images() {
      return this.getImages();
    }
    get user() {
    // get owner() {
      return this.getUser()
    }
  }

  Ad.init({
    title: Sequelize.STRING,
    tags: Sequelize.STRING,
    description: Sequelize.STRING,
    price: Sequelize.INTEGER,
    address: Sequelize.STRING,
    },
    { 
      // defaultScope: {
      //   where: {
      //     deleted: false
      //   }
      // },

      scopes: {
        deleted: {
          where: {
            deleted: true
          }
        },
      },
      
      sequelize, modelName: 'ad' })

  // // sequelize.sync();

  class User extends Sequelize.Model {
    get avatar() {
      return this.getAvatars({ order:[["id","DESC"]], limit : 1 });
    }
  }

  User.init({
    login: Sequelize.STRING,
    password: Sequelize.STRING,
    nick: Sequelize.STRING,
    phones: Sequelize.STRING,
    address: Sequelize.STRING,
  }, { sequelize, modelName: 'user' })

  User.hasMany(Ad)
  Ad.belongsTo(User)

  class Image extends Sequelize.Model {

  }
  Image.init({
    originalname: Sequelize.STRING,
    mimetype: Sequelize.STRING,
    filename: Sequelize.STRING,
    size: Sequelize.INTEGER,
    url: Sequelize.STRING
  }, { sequelize, modelName: 'image' })

  Image.belongsTo(User, { as: 'avatar' })
  User.hasMany(Image, { 
    as: 'avatars',
    foreignKey: 'avatarId' })

  Image.belongsTo(User)
  User.hasMany(Image)

  Image.belongsTo(Ad)
  Ad.hasMany(Image, { 
    foreignKey: 'adId' })

// console.log(User.prototype);

  return { Ad, User, Image }
}
//////////////////////////////////////////
class GlobalUser extends Sequelize.Model {
}

GlobalUser.init({
  login: Sequelize.STRING,
  password: Sequelize.STRING,
  nick: Sequelize.STRING,
  phones: Sequelize.STRING,
  address: Sequelize.STRING,
}, {sequelize, modelName: 'user'})


const schema = buildSchema(`
type Query{
  login(login: String, password:String): String
  getAds(settings: String): [Ad]
  AdFindOne (id: ID): Ad
  getUser(id: ID): User
  userAdFind(id: ID): [Ad]
  AdSearch(queryString: String): [Ad]
}

type Mutation{
  upsertAd(ad: AdInput): Ad
  deleteAd(id: ID): Ad
  createUser(login: String!, password: String!): User
  userUpdate(myProfile: UserInput): User
  
}

type Ad{
  id: ID
  createdAt: String
  updatedAt: String

  userId: ID
  title: String
  tags: String
  description: String
  price: Int
  address: String

  user: User
  images: [Image]
}

input AdInput {
  id: ID
  title: String
  tags: String
  description: String
  price: Int
  address: String
  
  images: [ID]
  
}

type User {
  id: ID
  createdAt: String
  updatedAt: String

  login: String
  nick: String
  phones: String
  address: String
  avatar: [Image]
}

input UserInput {
  id: ID

  login: String
  nick: String
  phones: String
  address: String
  avatar: [ID]
}

type Image {
  id: ID
  createdAt: String
  updatedAt: String

  originalname: String,
  mimetype: String,
  filename: String,
  size: Int,
  url: String
}

input ImageInput {
  id: ID,
  createdAt: String
  text: String,
  url: String
}
`)


const rootValue = {

  async login({ login, password }) {
    if (!login || !password) {
      throw new Error("Wrong creditnails");
    }

    const user = await GlobalUser.findOne({ where: { login } })
    // console.log("u_s_e_r", user);
    if (!user) {
      throw new Error("User not found");
    }

    if (await compare(password, user.password)) {
      return sign({ id: user.id, login: user.login }, JWT_SALT)
    }

    throw new Error("Wrong password");
  },

  async createUser({ login, password }, { thisUser }) {
    if (!login || !password) {
      throw new Error("Wrong creditnails");
    }
    if (thisUser) {
      throw new Error("User already loginned");
    }
    if (!(await GlobalUser.findOne({ where: { login } }))) {
      return await GlobalUser.create({ login, password: await hash(password, 10) });
    }
    throw new Error("User already exist");
  },

  async userUpdate({ myProfile }, { thisUser, models: { Image, User } }) {
    if (thisUser) {
          thisUser.id = thisUser.id;
          thisUser.login = myProfile.login;
          thisUser.nick = myProfile.nick;
          thisUser.phones = myProfile.phones;
          thisUser.address = myProfile.address;
          await thisUser.save();
          await thisUser.addAvatar(myProfile.avatar);
          return thisUser;
    }
    throw new Error("Unauthorized user");
  },

  async getUser({ id }, { thisUser, models: { User } }) {
    if (thisUser) {
      // console.log("THIS USER: ", thisUser);
      return await User.findByPk(id);
    }
    throw new Error("Unauthorized user");
  },

  async getAds({ settings }, { thisUser, models: { Ad } }) {
    if (thisUser) {
      const {order, offset, limit } = JSON.parse(settings)
      return await Ad.findAll({ order, offset, limit});
    }
    throw new Error("Unauthorized user");
  },

  async AdFindOne({ id }, { thisUser, models: { User, Ad } }) {
    if (thisUser) {
      // console.log("АйДи", id);

      let ad = await Ad.findByPk(id);
      console.log(ad);
      return ad;

    }
    throw new Error("Unauthorized user");
  },

  async userAdFind({ id }, { thisUser, models: { User, Ad } }) {
    if (thisUser) {
      console.log(id);
      let ads = await Ad.findAll({ order:[["id","DESC"]], where: { UserId: id } });
      return ads;
    }
    throw new Error("Unauthorized user");
  },

  async AdSearch({ queryString }, { thisUser, models: { User, Ad } }) {
    if (thisUser) {
      console.log(queryString);
      let ads = await Ad.findAll({ where: {
        [Op.or]: [
          {title: { [Op.like]: `%${queryString}%` }},
          {description: { [Op.like]: `%${queryString}%` }},
        ]
      }});

      console.log(ads);
      return ads;
    }
    throw new Error("Unauthorized user");
  },

  
  async deleteAd({ id }, { thisUser, models: { User, Ad } }) {
    if (thisUser) {
      try {
        let ad = await Ad.findByPk(id);
        // let user = await User.findByPk(thisUser.id);
        // await user.removeAd(ad);
        await Ad.destroy(
          { where: { id } })

        return ad;

      } catch (error) {
        throw new Error("Something went wrong");
      }

    }
    throw new Error("Unauthorized user");
  },

  async upsertAd({ ad }, { thisUser, models: { User, Ad } }) {
    if (thisUser) {
      console.log("'АД:::': ", ad);

      // if (await thisUser.hasImages(ad.imageIds)) {
        let dbAd;
        if (ad.id) {
          dbAd = await Ad.findByPk(ad.id);

          dbAd.title = ad.title;
          dbAd.tags = ad.tags;
          dbAd.price = ad.price;
          dbAd.description = ad.description;
          dbAd.address = ad.address;
          // dbAd = ad; ?????
          await dbAd.save();

          
          // await dbAd.images.destroy({where: {id}})
          // await dbAd.images.destroy();
          console.log("'DBAD': ", dbAd);
          const DBAD_IMG = await dbAd.images;
          console.log("'DBAD_IMG': ", DBAD_IMG);
          // await dbAd.removeImage(dbAd.images);
          // await dbAd.removeImage(dbAd.adId); // ???????????????????????????????????????

          await dbAd.addImage(ad.images);
          return dbAd;
        }
        else {
          // console.log("THIS____USER: ", thisUser);
          // console.log("'DBAD': ", dbAd);

          dbAd = await thisUser.createAd(ad);
          await dbAd.addImage(ad.images);
          return dbAd;
        }

        // return dbAd;
      // }
      // throw new Error("Not user's image");
    }
    throw new Error("Unauthorized user");
  },

}


const app = express();
app.use(express.static('public'));
app.use(bodyParser.json());


app.use('/graphql', graphqlHTTP(async (req, res) => {
  const decodedUser = jwtCheck(req);
  // console.log("DECODED USER: ", decodedUser);

  if (decodedUser) {
    const models = getModels(decodedUser.id);
    const thisUser = await models.User.findByPk(decodedUser.id)
    // console.log("MODELS: ", models) // { Ad: ad, User: user, Image: image }
    // console.log("ThIs USER: ", thisUser) //user {dataValues: {id: 1,login: 'vasya'.....
    return {
      schema,
      rootValue,
      graphiql: true,
      context: { thisUser, models }
    }
  }
  return {
    schema,
    rootValue,
    graphiql: true,
    context: { models: getModels(-1) }
  }
}))


app.post('/upload', upload.single('dropZone'), async (req, res) => {
// app.post('/upload', upload.array('file'), async (req, res) => {    ???????????????

  // console.log("REQ_FILE: ", req.file);

    const decodedUser = jwtCheck(req)
    const models = getModels(decodedUser.id);

    if (decodedUser) {
      const {originalname, mimetype, filename, size, path} = req.file
      // console.log("P_A_T_H: ", path);
      url = path.slice(7);
      const image = await models.Image.create({originalname, mimetype, filename, size, url, userId: decodedUser.id})
      // console.log("I_M_A_G_E: ", image);

      res.status(201).end(JSON.stringify(image))
    }
    else {
      res.status(403).end('Unauthorized file upload prohibited')
  }
    
});

app.listen(PORT, () => {
  console.log(`"${APP_NAME}" is listening on port:${PORT}`)
})










//////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////
; (async () => {
  // await sequelize.sync({ force: true }) // пересоздаст таблицы
  // await sequelize.sync({ alter: true }) // приводит таблицу в соответствие с моделью
  ////// await sequelize.sync()
  // const vasya1 = await GlobalUser.create({ 
  //   login: 'vasya', 
  //   password: await hash('123', 10),
  // });
  // const petya2 = await GlobalUser.create({ 
  //   login: 'petya', 
  //   password: await hash('123', 10),
  // });
  // const elena = await GlobalUser.create({ 
  //   login: 'elena33', 
  //   password: await hash('123', 10),
  // });

  // const models1 = getModels(1);
  // const models2 = getModels(2);
  // const models3 = getModels(3);

  // await models1.Ad.create({
  //   title: 'Продам телефон',
  //   tags: "Electronics",
  //   description: "Xiaomi MI9 ",
  //   price: 700,
  //   address: "Харьков",
  //   userId: 1
  // })

  // await models2.Ad.create({
  //   title: 'Продам диван',
  //   tags: "House and garden",
  //   description: "Новый диван",
  //   price: 2000,
  //   address: "Киев",
  //   userId: 2
  // });

  // await models3.Ad.create({
  //    title: 'Частный дом',
  //    tags: "House and garden",
  //    description: "Частный дом 100 квадратов",
  //    price: 15000,
  //    address: "Харьков",
  //    userId: 3
  //    });

  // await models3.Ad.create({
  //    title: 'Дом',
  //    tags: "House and garden",
  //    description: "продам домик",
  //    price: 8000,
  //    address: "Харьков",
  //    userId: 3
  //    });

})//();





//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
//   async addAd({ ad }, {thisUser, models: {User}}) {
//     if (thisUser) {
//       if (await thisUser.hasImages(ad.imageIds)) {
//         const newAd = await thisUser.createAd(ad);
//         await newAd.setImages(ad.imageIds);
//         return newAd;
//       }
//       throw new Error("Not user's image");
//     }

//     throw new Error("Unauthorized user");

//   },

//   async editAd({ ad }, { thisUser, models: {Ad} }){
//     if (thisUser && await thisUser.hasImages(ad.imageIds || [])){
//         let dbAd = await Ad.findByPk(ad.id);

//         // console.log("'DBAD': ", dbAd);
//         // console.log("'ad': ", ad);

//         dbAd.title = ad.title;
//         dbAd.tags = ad.tags;
//         dbAd.price = ad.price;
//         dbAd.description = ad.description;
//         dbAd.address = ad.address;

//         // dbAd = ad;

//         await dbAd.save();
//         await dbAd.setImages(ad.imageIds);

//         return dbAd;
//     }
// },

// src="http://localhost:4000/upload/6bd4bbc95702d827b634c7ab9a56dfb8"
