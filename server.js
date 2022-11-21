const express = require('express');
const bodyParser = require('body-parser');
const { graphqlHTTP } = require('express-graphql');
const { buildSchema } = require('graphql');
const multer = require('multer');
const { sign, verify } = require('jsonwebtoken');
const { hash, compare } = require('bcrypt');
const upload = multer({ dest: './public/upload/' });
const Sequelize = require('sequelize');

const APP_NAME = 'KupiSlona';
const JWT_SALT = 'JwT_SaLt82&';
const PORT = 4000;

// mariaDB:
// user: "mv"
// password: "MyNewPass5!"

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
    get user() {
    // get owner() {
      return this.getUser()
    }

    get images() {
      return this.getImages()
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
    get userAds() {
      ////// ИЗМЕНИТЬ НА ТОЛЬКО СВОИ
      return this.getAds()
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
    size: Sequelize.INTEGER
  }, { sequelize, modelName: 'image' })

  Image.belongsTo(User, { as: 'avatar' })
  User.hasMany(Image, { as: 'avatars' })

  Image.belongsTo(User)
  User.hasMany(Image)

  Image.belongsTo(Ad)
  Ad.hasMany(Image)

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
  getAds: [Ad]
  AdFindOne (id: ID): Ad
  getUser(id: ID): User
}

type Mutation{
  upsertAd(ad: AdInput): Ad
  deleteAd(id: ID): Ad
  createUser(login: String!, password: String!): User
  
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
  
  imageIds: [ID]
  
}

type User {
  id: ID
  createdAt: String
  updatedAt: String

  login: String
  nick: String
  phones: String
  address: String

  userAds: [Ad]
}

type Image {
  id: ID
  createdAt: String
  updatedAt: String

  originalname: String,
  mimetype: String,
  filename: String,
  size: Int
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

  async getUser({ id }, { thisUser, models: { User } }) {
    if (thisUser) {
      return await User.findByPk(id);
    }
    throw new Error("Unauthorized user");
  },

  async getAds(skip, { thisUser, models: { Ad } }) {
    if (thisUser) {
      return await Ad.findAll({});
      // return await Ad.scope('deleted').findAll();
    }
    throw new Error("Unauthorized user");
  },

  async AdFindOne({ id }, { thisUser, models: { User, Ad } }) {
    if (thisUser) {
      console.log("АйДи", id);

      let ad = await Ad.findByPk(id);
      console.log(ad);
      return ad;

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
      console.log(thisUser);
      if (await thisUser.hasImages(ad.imageIds)) {
        let dbAd;

        if (ad.id) {
          dbAd = await Ad.findByPk(ad.id);
          // console.log("'DBAD': ", dbAd);
          // console.log("'ad': ", ad);
          dbAd.title = ad.title;
          dbAd.tags = ad.tags;
          dbAd.price = ad.price;
          dbAd.description = ad.description;
          dbAd.address = ad.address;
          // dbAd = ad;
          await dbAd.save();
          await dbAd.setImages(ad.imageIds);
          return dbAd;
        }
        else {
          const dbAd = await thisUser.createAd(ad);
          await dbAd.setImages(ad.imageIds);
          return dbAd;
        }

        // return dbAd;
      }
      throw new Error("Not user's image");
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


app.post('/upload', upload.single('file'), async (req, res) => {
    const decodedUser = jwtCheck(req)
    const models = getModels(decodedUser.id);

    if (decodedUser) {
      const {originalname, mimetype, filename, size} = req.file
      const image = await models.Image.create({originalname, mimetype, filename, size, userId: decodedUser.id})

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
  ////// await sequelize.sync()
  const vasya = await GlobalUser.create({ 
    login: 'vasya', 
    password: await hash('123123', 10),
  });
  const petya = await GlobalUser.create({ 
    login: 'petya', 
    password: await hash('123123', 10),
  });

  const models1 = getModels(1);
  const models2 = getModels(2);

  await models1.Ad.create({
    title: 'Продам телефон',
    tags: "Electronics",
    description: "Xiaomi MI9 ",
    price: 700,
    address: "Харьков",
    userId: 1
  })

  await models2.Ad.create({
    title: 'Продам диван',
    tags: "House and garden",
    description: "Новый диван",
    price: 2000,
    address: "Киев",
    userId: 2
  });

  await models1.Ad.create({
     title: 'Частный дом',
     tags: "House and garden",
     description: "Частный дом 100 квадратов",
     price: 15000,
     address: "Харьков",
     userId: 1
     });

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

